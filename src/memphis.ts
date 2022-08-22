// Copyright 2021-2022 The Memphis Authors
// Licensed under the Apache License, Version 2.0 (the “License”);
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an “AS IS” BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as net from 'net';
import * as events from 'events';
import * as broker from 'nats';
import { headers } from 'nats';
import { v4 as uuidv4 } from 'uuid';
import ObjectID from 'bson-objectid';

interface IRetentionTypes {
    MAX_MESSAGE_AGE_SECONDS: string;
    MESSAGES: string;
    BYTES: string;
}

const retentionTypes: IRetentionTypes = {
    MAX_MESSAGE_AGE_SECONDS: 'message_age_sec',
    MESSAGES: 'messages',
    BYTES: 'bytes'
};

interface IStorageTypes {
    FILE: string;
    MEMORY: string;
}

const storageTypes: IStorageTypes = {
    FILE: 'file',
    MEMORY: 'memory'
};

export class Memphis {
    private isConnectionActive: boolean;
    public connectionId: string;
    public host: string;
    public port: number;
    public username: string;
    private connectionToken: string;
    private pingTimeout: any;
    private reconnect: boolean;
    private maxReconnect: number;
    private reconnectIntervalMs: number;
    private timeoutMs: number;
    public brokerConnection: any;
    public brokerManager: any;
    public brokerStats: any;
    public retentionTypes!: IRetentionTypes;
    public storageTypes!: IStorageTypes;
    public JSONC: any;

    constructor() {
        this.isConnectionActive = false;
        this.connectionId = ObjectID().toHexString().toString();
        this.host = '';
        this.port = 6666;
        this.username = '';
        this.connectionToken = '';
        this.pingTimeout = null;
        this.reconnect = true;
        this.maxReconnect = 3;
        this.reconnectIntervalMs = 200;
        this.timeoutMs = 15000;
        this.brokerConnection = null;
        this.brokerManager = null;
        this.brokerStats = null;
        this.retentionTypes = retentionTypes;
        this.storageTypes = storageTypes;
    }

    /**
     * Creates connection with Memphis.
     * @param {String} host - memphis host.
     * @param {Number} port - broker port, default is 6666.
     * @param {String} username - user of type root/application.
     * @param {String} connectionToken - broker token.
     * @param {Boolean} reconnect - whether to do reconnect while connection is lost.
     * @param {Number} maxReconnect - The reconnect attempts.
     * @param {Number} reconnectIntervalMs - Interval in miliseconds between reconnect attempts.
     * @param {Number} timeoutMs - connection timeout in miliseconds.
     */

    connect({
        host,
        port = 6666,
        username,
        connectionToken,
        reconnect = true,
        maxReconnect = 3,
        reconnectIntervalMs = 200,
        timeoutMs = 15000
    }: {
        host: string;
        port?: number;
        username: string;
        connectionToken: string;
        reconnect?: boolean;
        maxReconnect?: number;
        reconnectIntervalMs?: number;
        timeoutMs?: number;
    }): Promise<Memphis> {
        return new Promise(async (resolve, reject) => {
            this.host = this._normalizeHost(host);
            this.port = port;
            this.username = username;
            this.connectionToken = connectionToken;
            this.reconnect = reconnect;
            this.maxReconnect = maxReconnect > 9 ? 9 : maxReconnect;
            this.reconnectIntervalMs = reconnectIntervalMs;
            this.timeoutMs = timeoutMs;

            let conId_username = this.connectionId + '::' + username;
            try {
                this.brokerManager = await broker.connect({
                    servers: `${this.host}:${this.port}`,
                    reconnect: this.reconnect,
                    maxReconnectAttempts: this.reconnect ? this.maxReconnect : 0,
                    reconnectTimeWait: this.reconnectIntervalMs,
                    timeout: this.timeoutMs,
                    token: this.connectionToken,
                    name: conId_username
                });

                this.brokerConnection = this.brokerManager.jetstream();
                this.brokerStats = await this.brokerManager.jetstreamManager();
                this.JSONC = broker.JSONCodec();
                this.isConnectionActive = true;
                return resolve(this);
            } catch (ex) {
                return reject(ex);
            }
        });
    }

    private _normalizeHost(host: string): string {
        if (host.startsWith('http://')) return host.split('http://')[1];
        else if (host.startsWith('https://')) return host.split('https://')[1];
        else return host;
    }

    /**
     * Creates a factory.
     * @param {String} name - factory name.
     * @param {String} description - factory description (optional).
     */
    async factory({ name, description = '' }: { name: string; description?: string }): Promise<Factory> {
        try {
            if (!this.isConnectionActive) throw new Error('Connection is dead');

            let createFactoryReq = {
                username: this.username,
                factory_name: name,
                factory_description: description
            };
            let data = this.JSONC.encode(createFactoryReq);
            let errMsg = await this.brokerManager.request('$memphis_factory_creations', data);
            errMsg = errMsg.data.toString();
            if (errMsg != '') {
                throw new Error(errMsg);
            }
            return new Factory(this, name);
        } catch (ex) {
            if (typeof ex == 'string') {
                return new Factory(this, name.toLowerCase());
            }
            throw ex;
        }
    }

    /**
     * Creates a station.
     * @param {String} name - station name.
     * @param {String} factoryName - factory name to link the station with.
     * @param {Memphis.retentionTypes} retentionType - retention type, default is MAX_MESSAGE_AGE_SECONDS.
     * @param {Number} retentionValue - number which represents the retention based on the retentionType, default is 604800.
     * @param {Memphis.storageTypes} storageType - persistance storage for messages of the station, default is storageTypes.FILE.
     * @param {Number} replicas - number of replicas for the messages of the data, default is 1.
     * @param {Boolean} dedupEnabled - whether to allow dedup mecanism, dedup happens based on message ID, default is false.
     * @param {Number} dedupWindowMs - time frame in which dedup track messages, default is 0.
     */
    async station({
        name,
        factoryName,
        retentionType = retentionTypes.MAX_MESSAGE_AGE_SECONDS,
        retentionValue = 604800,
        storageType = storageTypes.FILE,
        replicas = 1,
        dedupEnabled = false,
        dedupWindowMs = 0
    }: {
        name: string;
        factoryName: string;
        retentionType?: string;
        retentionValue?: number;
        storageType?: string;
        replicas?: number;
        dedupEnabled?: boolean;
        dedupWindowMs?: number;
    }): Promise<Station> {
        try {
            if (!this.isConnectionActive) throw new Error('Connection is dead');
            let createStationReq = {
                name: name,
                factory_name: factoryName,
                retention_type: retentionType,
                retention_value: retentionValue,
                storage_type: storageType,
                replicas: replicas,
                dedup_enabled: dedupEnabled,
                dedup_window_in_ms: dedupWindowMs
            };
            let data = this.JSONC.encode(createStationReq);
            await this.brokerManager.publish('$memphis_station_creations', data);
            return new Station(this, name);
        } catch (ex) {
            if (typeof ex == 'string') {
                return new Station(this, name.toLowerCase());
            }
            throw ex;
        }
    }

    /**
     * Creates a producer.
     * @param {String} stationName - station name to produce messages into.
     * @param {String} producerName - name for the producer.
     */
    async producer({ stationName, producerName }: { stationName: string; producerName: string }): Promise<Producer> {
        try {
            if (!this.isConnectionActive) throw new Error('Connection is dead');
            let createProducerReq = {
                name: producerName,
                station_name: stationName,
                connection_id: this.connectionId,
                producer_type: 'application'
            };
            let data = this.JSONC.encode(createProducerReq);
            let errMsg = await this.brokerManager.request('$memphis_producer_creations', data);
            errMsg = errMsg.data.toString();
            if (errMsg != '') {
                throw new Error(errMsg);
            }

            return new Producer(this, producerName, stationName);
        } catch (ex) {
            throw ex;
        }
    }

    /**
     * Creates a consumer.
     * @param {String} stationName - station name to consume messages from.
     * @param {String} consumerName - name for the consumer.
     * @param {String} consumerGroup - consumer group name, defaults to the consumer name.
     * @param {Number} pullIntervalMs - interval in miliseconds between pulls, default is 1000.
     * @param {Number} batchSize - pull batch size.
     * @param {Number} batchMaxTimeToWaitMs - max time in miliseconds to wait between pulls, defauls is 5000.
     * @param {Number} `maxAckTimeMs` - max time for ack a message in miliseconds, in case a message not acked in this time period the Memphis broker will resend it untill reaches the maxMsgDeliveries value
     * @param {Number} maxMsgDeliveries - max number of message deliveries, by default is 10
     */
    async consumer({
        stationName,
        consumerName,
        consumerGroup,
        pullIntervalMs = 1000,
        batchSize = 10,
        batchMaxTimeToWaitMs = 5000,
        maxAckTimeMs = 30000,
        maxMsgDeliveries = 10
    }: {
        stationName: string;
        consumerName: string;
        consumerGroup: string;
        pullIntervalMs?: number;
        batchSize?: number;
        batchMaxTimeToWaitMs?: number;
        maxAckTimeMs?: number;
        maxMsgDeliveries?: number;
    }): Promise<Consumer> {
        try {
            if (!this.isConnectionActive) throw new Error('Connection is dead');

            consumerGroup = consumerGroup || consumerName;
            let createConsumerReq = {
                name: consumerName,
                station_name: stationName,
                connection_id: this.connectionId,
                consumer_type: 'application',
                consumers_group: consumerGroup,
                max_ack_time_ms: maxAckTimeMs,
                max_msg_deliveries: maxMsgDeliveries
            };
            let data = this.JSONC.encode(createConsumerReq);
            let errMsg = await this.brokerManager.request('$memphis_consumer_creations', data);
            errMsg = errMsg.data.toString();
            if (errMsg != '') {
                throw new Error(errMsg);
            }

            return new Consumer(this, stationName, consumerName, consumerGroup, pullIntervalMs, batchSize, batchMaxTimeToWaitMs, maxAckTimeMs, maxMsgDeliveries);
        } catch (ex) {
            throw ex;
        }
    }

    /**
     * Close Memphis connection.
     */
    close() {
        clearTimeout(this.pingTimeout);
        setTimeout(() => {
            this.brokerManager && this.brokerManager.close();
        }, 500);
    }
}

class Producer {
    private connection: Memphis;
    private producerName: string;
    private stationName: string;

    constructor(connection: Memphis, producerName: string, stationName: string) {
        this.connection = connection;
        this.producerName = producerName.toLowerCase();
        this.stationName = stationName.toLowerCase();
    }

    /**
     * Produces a message into a station.
     * @param {Uint8Array} message - message to send into the station.
     * @param {Number} ackWaitSec - max time in seconds to wait for an ack from memphis.
     */
    async produce({ message, ackWaitSec = 15 }: { message: Uint8Array; ackWaitSec?: number }): Promise<void> {
        try {
            const h = headers();
            h.append('connectionId', this.connection.connectionId);
            h.append('producedBy', this.producerName);

            await this.connection.brokerConnection.publish(`${this.stationName}.final`, message, { msgID: uuidv4(), headers: h, ackWait: ackWaitSec * 1000 * 1000000 });
        } catch (ex: any) {
            if (ex.code === '503') {
                throw new Error('Produce operation has failed, please check whether Station/Producer are still exist');
            }
            throw ex;
        }
    }

    /**
     * Destroy the producer.
     */
    async destroy(): Promise<void> {
        try {
            let removeProducerReq = {
                name: this.producerName,
                station_name: this.stationName,
                username: this.connection.username
            };
            let data = this.connection.JSONC.encode(removeProducerReq);
            await this.connection.brokerManager.publish('$memphis_producer_destructions', data);
        } catch (_) {}
    }
}

class Consumer {
    private connection: Memphis;
    private stationName: string;
    private consumerName: string;
    private consumerGroup: string;
    private pullIntervalMs: number;
    private batchSize: number;
    private batchMaxTimeToWaitMs: number;
    private maxAckTimeMs: number;
    private maxMsgDeliveries: number;
    private eventEmitter: events.EventEmitter;
    private pullInterval: any;
    private pingConsumerInvtervalMs: number;
    private pingConsumerInvterval: any;

    constructor(
        connection: Memphis,
        stationName: string,
        consumerName: string,
        consumerGroup: string,
        pullIntervalMs: number,
        batchSize: number,
        batchMaxTimeToWaitMs: number,
        maxAckTimeMs: number,
        maxMsgDeliveries: number
    ) {
        this.connection = connection;
        this.stationName = stationName.toLowerCase();
        this.consumerName = consumerName.toLowerCase();
        this.consumerGroup = consumerGroup.toLowerCase();
        this.pullIntervalMs = pullIntervalMs;
        this.batchSize = batchSize;
        this.batchMaxTimeToWaitMs = batchMaxTimeToWaitMs;
        this.maxAckTimeMs = maxAckTimeMs;
        this.maxMsgDeliveries = maxMsgDeliveries;
        this.eventEmitter = new events.EventEmitter();
        this.pullInterval = null;
        this.pingConsumerInvtervalMs = 30000;
        this.pingConsumerInvterval = null;
    }

    /**
     * Creates an event listener.
     * @param {String} event - the event to listen to.
     * @param {Function} cb - a callback function.
     */
    on(event: String, cb: (...args: any[]) => void) {
        if (event === 'message') {
            this.connection.brokerConnection
                .pullSubscribe(`${this.stationName}.final`, {
                    mack: true,
                    config: {
                        durable_name: this.consumerGroup ? this.consumerGroup : this.consumerName,
                        ack_wait: this.maxAckTimeMs
                    }
                })
                .then(async (psub: any) => {
                    psub.pull({
                        batch: this.batchSize,
                        expires: this.batchMaxTimeToWaitMs
                    });
                    this.pullInterval = setInterval(() => {
                        if (!this.connection.brokerManager.isClosed())
                            psub.pull({
                                batch: this.batchSize,
                                expires: this.batchMaxTimeToWaitMs
                            });
                        else clearInterval(this.pullInterval);
                    }, this.pullIntervalMs);

                    this.pingConsumerInvterval = setInterval(async () => {
                        if (!this.connection.brokerManager.isClosed()) {
                            this._pingConsumer();
                        } else clearInterval(this.pingConsumerInvterval);
                    }, this.pingConsumerInvtervalMs);

                    const sub = this.connection.brokerManager.subscribe(`$memphis_dlq_${this.stationName}_${this.consumerGroup}`, {
                        queue: `$memphis_${this.stationName}_${this.consumerGroup}`
                    });
                    this._handleAsyncIterableSubscriber(psub);
                    this._handleAsyncIterableSubscriber(sub);
                })
                .catch((error: any) => this.eventEmitter.emit('error', error));
        }

        this.eventEmitter.on(<string>event, cb);
    }

    private async _handleAsyncIterableSubscriber(iter: any) {
        for await (const m of iter) {
            this.eventEmitter.emit('message', new Message(m));
        }
    }

    private async _pingConsumer() {
        try {
            const durableName = this.consumerGroup || this.consumerName;
            await this.connection.brokerStats.consumers.info(this.stationName, durableName);
        } catch (ex) {
            this.eventEmitter.emit('error', 'station/consumer were not found');
        }
    }

    /**
     * Destroy the consumer.
     */
    async destroy(): Promise<void> {
        clearInterval(this.pullInterval);
        try {
            let removeConsumerReq = {
                name: this.consumerName,
                station_name: this.stationName,
                username: this.connection.username
            };
            let data = this.connection.JSONC.encode(removeConsumerReq);
            await this.connection.brokerManager.publish('$memphis_consumer_destructions', data);
        } catch (_) {}
    }
}

class Message {
    private message: broker.JsMsg;

    constructor(message: broker.JsMsg) {
        this.message = message;
    }

    /**
     * Ack a message is done processing.
     */
    ack() {
        if (this.message.ack)
            // for dlq events which are unackable (core NATS messages)
            this.message.ack();
    }

    getData() {
        return this.message.data;
    }
}

class Factory {
    private connection: Memphis;
    private name: string;

    constructor(connection: Memphis, name: string) {
        this.connection = connection;
        this.name = name.toLowerCase();
    }

    /**
     * Destroy the factory.
     */
    async destroy(): Promise<void> {
        try {
            let removeFactoryReq = {
                name: this.name
            };
            let data = this.connection.JSONC.encode(removeFactoryReq);
            await this.connection.brokerManager.publish('$memphis_factory_destructions', data);
        } catch (_) {}
    }
}

class Station {
    private connection: Memphis;
    private name: string;

    constructor(connection: Memphis, name: string) {
        this.connection = connection;
        this.name = name.toLowerCase();
    }

    /**
     * Destroy the station.
     */
    async destroy(): Promise<void> {
        try {
            let removeStationReq = {
                name: this.name
            };
            let data = this.connection.JSONC.encode(removeStationReq);
            await this.connection.brokerManager.publish('$memphis_station_destructions', data);
        } catch (_) {}
    }
}

const MemphisInstance = new Memphis();

export default MemphisInstance;
