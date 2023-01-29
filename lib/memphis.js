"use strict";
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Memphis = void 0;
const events = require("events");
const broker = require("nats");
const nats_1 = require("nats");
const protobuf = require("protobufjs");
const fs = require("fs");
const ajv_1 = require("ajv");
const ajv_draft_04_1 = require("ajv-draft-04");
const json_schema_draft_07_json_1 = require("ajv/dist/refs/json-schema-draft-07.json");
const json_schema_draft_06_json_1 = require("ajv/dist/refs/json-schema-draft-06.json");
const _2020_1 = require("ajv/dist/2020");
const graphql_1 = require("graphql");
const retentionTypes = {
    MAX_MESSAGE_AGE_SECONDS: 'message_age_sec',
    MESSAGES: 'messages',
    BYTES: 'bytes'
};
const storageTypes = {
    DISK: 'file',
    MEMORY: 'memory'
};
const MemphisError = (error) => {
    if (error === null || error === void 0 ? void 0 : error.message) {
        error.message = error.message.replace('NatsError', 'memphis');
        error.message = error.message.replace('Nats', 'memphis');
        error.message = error.message.replace('nats', 'memphis');
    }
    if (error === null || error === void 0 ? void 0 : error.stack) {
        error.stack = error.stack.replace('NatsError', 'memphis');
        error.stack = error.stack.replace('Nats:', 'memphis');
        error.stack = error.stack.replace('nats:', 'memphis');
    }
    if (error === null || error === void 0 ? void 0 : error.name) {
        error.name = error.name.replace('NatsError', 'MemphisError');
        error.name = error.name.replace('Nats', 'MemphisError');
        error.name = error.name.replace('nats', 'MemphisError');
    }
    return error;
};
function stringToHex(str) {
    var hex = '';
    for (var i = 0; i < str.length; i++) {
        hex += '' + str.charCodeAt(i).toString(16);
    }
    return hex;
}
const schemaVFailAlertType = 'schema_validation_fail_alert';
class Memphis {
    constructor() {
        this.isConnectionActive = false;
        this.host = '';
        this.port = 6666;
        this.username = '';
        this.connectionToken = '';
        this.reconnect = true;
        this.maxReconnect = 3;
        this.reconnectIntervalMs = 200;
        this.timeoutMs = 15000;
        this.brokerConnection = null;
        this.brokerManager = null;
        this.brokerStats = null;
        this.retentionTypes = retentionTypes;
        this.storageTypes = storageTypes;
        this.JSONC = broker.JSONCodec();
        this.connectionId = this._generateConnectionID();
        this.stationSchemaDataMap = new Map();
        this.schemaUpdatesSubs = new Map();
        this.producersPerStation = new Map();
        this.meassageDescriptors = new Map();
        this.jsonSchemas = new Map();
        this.graphqlSchemas = new Map();
        this.clusterConfigurations = new Map();
        this.stationSchemaverseToDlsMap = new Map();
    }
    resetVars() {
        this.isConnectionActive = false;
        this.host = '';
        this.port = 6666;
        this.username = '';
        this.connectionToken = '';
        this.reconnect = true;
        this.maxReconnect = 3;
        this.reconnectIntervalMs = 200;
        this.timeoutMs = 15000;
        this.brokerConnection = null;
        this.brokerManager = null;
        this.brokerStats = null;
        this.retentionTypes = retentionTypes;
        this.storageTypes = storageTypes;
        this.JSONC = broker.JSONCodec();
        this.connectionId = this._generateConnectionID();
        this.stationSchemaDataMap = new Map();
        this.schemaUpdatesSubs = new Map();
        this.producersPerStation = new Map();
        this.meassageDescriptors = new Map();
        this.jsonSchemas = new Map();
        this.graphqlSchemas = new Map();
        this.clusterConfigurations = new Map();
        this.stationSchemaverseToDlsMap = new Map();
    }
    connect({ host, port = 6666, username, connectionToken, reconnect = true, maxReconnect = 3, reconnectIntervalMs = 5000, timeoutMs = 15000, keyFile = '', certFile = '', caFile = '' }) {
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
                let connectionOpts = {
                    servers: `${this.host}:${this.port}`,
                    reconnect: this.reconnect,
                    maxReconnectAttempts: this.reconnect ? this.maxReconnect : 0,
                    reconnectTimeWait: this.reconnectIntervalMs,
                    timeout: this.timeoutMs,
                    token: this.connectionToken,
                    name: conId_username
                };
                if (keyFile !== '' || certFile !== '' || caFile !== '') {
                    if (keyFile === '') {
                        return reject(MemphisError(new Error('Must provide a TLS key file')));
                    }
                    if (certFile === '') {
                        return reject(MemphisError(new Error('Must provide a TLS cert file')));
                    }
                    if (caFile === '') {
                        return reject(MemphisError(new Error('Must provide a TLS ca file')));
                    }
                    let tlsOptions = {
                        keyFile: keyFile,
                        certFile: certFile,
                        caFile: caFile
                    };
                    connectionOpts['tls'] = tlsOptions;
                }
                this.brokerManager = await broker.connect(connectionOpts);
                this.brokerConnection = this.brokerManager.jetstream();
                this.brokerStats = await this.brokerManager.jetstreamManager();
                this.isConnectionActive = true;
                this._configurationsListener();
                (async () => {
                    var _a, e_1, _b, _c;
                    try {
                        for (var _d = true, _e = __asyncValues(this.brokerManager.status()), _f; _f = await _e.next(), _a = _f.done, !_a;) {
                            _c = _f.value;
                            _d = false;
                            try {
                                const s = _c;
                                switch (s.type) {
                                    case 'update':
                                        console.log(`reconnected to memphis successfully`);
                                        this.isConnectionActive = true;
                                        break;
                                    case 'reconnecting':
                                        console.log(`trying to reconnect to memphis - ${s.data}`);
                                        break;
                                    case 'disconnect':
                                        console.log(`disconnected from memphis - ${s.data}`);
                                        this.isConnectionActive = false;
                                        break;
                                    default:
                                        this.isConnectionActive = true;
                                }
                            }
                            finally {
                                _d = true;
                            }
                        }
                    }
                    catch (e_1_1) { e_1 = { error: e_1_1 }; }
                    finally {
                        try {
                            if (!_d && !_a && (_b = _e.return)) await _b.call(_e);
                        }
                        finally { if (e_1) throw e_1.error; }
                    }
                })().then();
                return resolve(this);
            }
            catch (ex) {
                return reject(MemphisError(ex));
            }
        });
    }
    async _compileProtobufSchema(stationName) {
        let stationSchemaData = this.stationSchemaDataMap.get(stationName);
        let protoPathName = `${__dirname}/${stationSchemaData['schema_name']}_${stationSchemaData['active_version']['version_number']}.proto`;
        fs.writeFileSync(protoPathName, stationSchemaData['active_version']['schema_content']);
        let root = await protobuf.load(protoPathName);
        fs.unlinkSync(protoPathName);
        let meassageDescriptor = root.lookupType(`${stationSchemaData['active_version']['message_struct_name']}`);
        this.meassageDescriptors.set(stationName, meassageDescriptor);
    }
    async _scemaUpdatesListener(stationName, schemaUpdateData) {
        try {
            const internalStationName = stationName.replace(/\./g, '#').toLowerCase();
            let schemaUpdateSubscription = this.schemaUpdatesSubs.has(internalStationName);
            if (schemaUpdateSubscription) {
                this.producersPerStation.set(internalStationName, this.producersPerStation.get(internalStationName) + 1);
            }
            else {
                let shouldDrop = schemaUpdateData['schema_name'] === '';
                if (!shouldDrop) {
                    this.stationSchemaDataMap.set(internalStationName, schemaUpdateData);
                    switch (schemaUpdateData['type']) {
                        case 'protobuf':
                            await this._compileProtobufSchema(internalStationName);
                            break;
                        case 'json':
                            const jsonSchema = this._compileJsonSchema(internalStationName);
                            this.jsonSchemas.set(internalStationName, jsonSchema);
                            break;
                        case 'graphql':
                            const graphQlSchema = this._compileGraphQl(internalStationName);
                            this.graphqlSchemas.set(internalStationName, graphQlSchema);
                            break;
                    }
                }
                const sub = this.brokerManager.subscribe(`$memphis_schema_updates_${internalStationName}`);
                this.producersPerStation.set(internalStationName, 1);
                this.schemaUpdatesSubs.set(internalStationName, sub);
                this._listenForSchemaUpdates(sub, internalStationName);
            }
        }
        catch (ex) {
            throw MemphisError(ex);
        }
    }
    _compileJsonSchema(stationName) {
        const ajv = new ajv_1.default();
        let stationSchemaData = this.stationSchemaDataMap.get(stationName);
        const schema = stationSchemaData['active_version']['schema_content'];
        const schemaObj = JSON.parse(schema);
        let validate;
        try {
            validate = ajv.compile(schemaObj);
            return validate;
        }
        catch (ex) {
            try {
                ajv.addMetaSchema(json_schema_draft_07_json_1.default);
                validate = ajv.compile(schemaObj);
                return validate;
            }
            catch (ex) {
                try {
                    const ajv = new ajv_draft_04_1.default();
                    validate = ajv.compile(schemaObj);
                    return validate;
                }
                catch (ex) {
                    try {
                        const ajv = new _2020_1.default();
                        validate = ajv.compile(schemaObj);
                        return validate;
                    }
                    catch (ex) {
                        try {
                            ajv.addMetaSchema(json_schema_draft_06_json_1.default);
                            return validate;
                        }
                        catch (ex) {
                            throw MemphisError(new Error('invalid json schema'));
                        }
                    }
                }
            }
        }
    }
    _compileGraphQl(stationName) {
        let stationSchemaData = this.stationSchemaDataMap.get(stationName);
        const schemaContent = stationSchemaData['active_version']['schema_content'];
        const graphQlSchema = (0, graphql_1.buildSchema)(schemaContent);
        return graphQlSchema;
    }
    async _listenForSchemaUpdates(sub, stationName) {
        var _a, e_2, _b, _c;
        try {
            for (var _d = true, sub_1 = __asyncValues(sub), sub_1_1; sub_1_1 = await sub_1.next(), _a = sub_1_1.done, !_a;) {
                _c = sub_1_1.value;
                _d = false;
                try {
                    const m = _c;
                    let data = this.JSONC.decode(m._rdata);
                    let shouldDrop = data['init']['schema_name'] === '';
                    if (shouldDrop) {
                        this.stationSchemaDataMap.delete(stationName);
                        this.meassageDescriptors.delete(stationName);
                        this.jsonSchemas.delete(stationName);
                    }
                    else {
                        this.stationSchemaDataMap.set(stationName, data.init);
                        try {
                            switch (data['init']['type']) {
                                case 'protobuf':
                                    await this._compileProtobufSchema(stationName);
                                    break;
                                case 'json':
                                    const jsonSchema = this._compileJsonSchema(stationName);
                                    this.jsonSchemas.set(stationName, jsonSchema);
                                    break;
                                case 'graphql':
                                    const graphQlSchema = this._compileGraphQl(stationName);
                                    this.graphqlSchemas.set(stationName, graphQlSchema);
                                    break;
                            }
                        }
                        catch (ex) {
                            throw MemphisError(ex);
                        }
                    }
                }
                finally {
                    _d = true;
                }
            }
        }
        catch (e_2_1) { e_2 = { error: e_2_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = sub_1.return)) await _b.call(sub_1);
            }
            finally { if (e_2) throw e_2.error; }
        }
    }
    async _configurationsListener() {
        var _a, e_3, _b, _c;
        try {
            const sub = this.brokerManager.subscribe(`$memphis_sdk_configurations_updates`);
            try {
                for (var _d = true, sub_2 = __asyncValues(sub), sub_2_1; sub_2_1 = await sub_2.next(), _a = sub_2_1.done, !_a;) {
                    _c = sub_2_1.value;
                    _d = false;
                    try {
                        const m = _c;
                        let data = this.JSONC.decode(m._rdata);
                        switch (data['type']) {
                            case 'send_notification':
                                this.clusterConfigurations.set(data['type'], data['update']);
                                break;
                            case 'schemaverse_to_dls':
                                this.stationSchemaverseToDlsMap.set(data['station_name'], data['update']);
                            default:
                                break;
                        }
                    }
                    finally {
                        _d = true;
                    }
                }
            }
            catch (e_3_1) { e_3 = { error: e_3_1 }; }
            finally {
                try {
                    if (!_d && !_a && (_b = sub_2.return)) await _b.call(sub_2);
                }
                finally { if (e_3) throw e_3.error; }
            }
        }
        catch (ex) {
            throw MemphisError(ex);
        }
    }
    sendNotification(title, msg, failedMsg, type) {
        const buf = this.JSONC.encode({
            title: title,
            msg: msg,
            type: type,
            code: failedMsg
        });
        this.brokerManager.publish('$memphis_notifications', buf);
    }
    _normalizeHost(host) {
        if (host.startsWith('http://'))
            return host.split('http://')[1];
        else if (host.startsWith('https://'))
            return host.split('https://')[1];
        else
            return host;
    }
    _generateConnectionID() {
        return [...Array(24)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
    }
    async station({ name, retentionType = retentionTypes.MAX_MESSAGE_AGE_SECONDS, retentionValue = 604800, storageType = storageTypes.DISK, replicas = 1, idempotencyWindowMs = 120000, schemaName = '', sendPoisonMsgToDls = true, sendSchemaFailedMsgToDls = true }) {
        var _a;
        try {
            if (!this.isConnectionActive)
                throw new Error('Connection is dead');
            let createStationReq = {
                name: name,
                retention_type: retentionType,
                retention_value: retentionValue,
                storage_type: storageType,
                replicas: replicas,
                idempotency_window_in_ms: idempotencyWindowMs,
                schema_name: schemaName,
                dls_configuration: {
                    poison: sendPoisonMsgToDls,
                    Schemaverse: sendSchemaFailedMsgToDls
                },
                username: this.username
            };
            let data = this.JSONC.encode(createStationReq);
            let errMsg = await this.brokerManager.request('$memphis_station_creations', data);
            errMsg = errMsg.data.toString();
            if (errMsg != '') {
                throw MemphisError(new Error(errMsg));
            }
            return new Station(this, name);
        }
        catch (ex) {
            if ((_a = ex.message) === null || _a === void 0 ? void 0 : _a.includes('already exists')) {
                return new Station(this, name.toLowerCase());
            }
            throw MemphisError(ex);
        }
    }
    async attachSchema({ name, stationName }) {
        try {
            if (!this.isConnectionActive)
                throw new Error('Connection is dead');
            if (name === '' || stationName === '') {
                throw new Error('name and station name can not be empty');
            }
            let attachSchemaReq = {
                name: name,
                station_name: stationName,
                username: this.username
            };
            let data = this.JSONC.encode(attachSchemaReq);
            let errMsg = await this.brokerManager.request('$memphis_schema_attachments', data);
            errMsg = errMsg.data.toString();
            if (errMsg != '') {
                throw MemphisError(new Error(errMsg));
            }
        }
        catch (ex) {
            throw MemphisError(ex);
        }
    }
    async detachSchema({ stationName }) {
        try {
            if (!this.isConnectionActive)
                throw new Error('Connection is dead');
            if (stationName === '') {
                throw new Error('station name is missing');
            }
            let detachSchemaReq = {
                station_name: stationName,
                username: this.username
            };
            let data = this.JSONC.encode(detachSchemaReq);
            let errMsg = await this.brokerManager.request('$memphis_schema_detachments', data);
            errMsg = errMsg.data.toString();
            if (errMsg != '') {
                throw MemphisError(new Error(errMsg));
            }
        }
        catch (ex) {
            throw MemphisError(ex);
        }
    }
    async producer({ stationName, producerName, genUniqueSuffix = false }) {
        try {
            if (!this.isConnectionActive)
                throw MemphisError(new Error('Connection is dead'));
            producerName = genUniqueSuffix ? producerName + '_' + generateNameSuffix() : producerName;
            let createProducerReq = {
                name: producerName,
                station_name: stationName,
                connection_id: this.connectionId,
                producer_type: 'application',
                req_version: 1,
                username: this.username
            };
            let data = this.JSONC.encode(createProducerReq);
            let createRes = await this.brokerManager.request('$memphis_producer_creations', data);
            createRes = this.JSONC.decode(createRes.data);
            if (createRes.error != '') {
                throw MemphisError(new Error(createRes.error));
            }
            let internal_station = stationName.replace(/\./g, '#').toLowerCase();
            this.stationSchemaverseToDlsMap.set(internal_station, createRes.schemaverse_to_dls);
            this.clusterConfigurations.set('send_notification', createRes.send_notification);
            await this._scemaUpdatesListener(stationName, createRes.schema_update);
            return new Producer(this, producerName, stationName);
        }
        catch (ex) {
            throw MemphisError(ex);
        }
    }
    async consumer({ stationName, consumerName, consumerGroup = '', pullIntervalMs = 1000, batchSize = 10, batchMaxTimeToWaitMs = 5000, maxAckTimeMs = 30000, maxMsgDeliveries = 10, genUniqueSuffix = false, startConsumeFromSequence = 1, lastMessages = -1 }) {
        try {
            if (!this.isConnectionActive)
                throw new Error('Connection is dead');
            consumerName = genUniqueSuffix ? consumerName + '_' + generateNameSuffix() : consumerName;
            consumerGroup = consumerGroup || consumerName;
            if (startConsumeFromSequence <= 0) {
                throw MemphisError(new Error('startConsumeFromSequence has to be a positive number'));
            }
            if (lastMessages < -1) {
                throw MemphisError(new Error('min value for LastMessages is -1'));
            }
            if (startConsumeFromSequence > 1 && lastMessages > -1) {
                throw MemphisError(new Error("Consumer creation options can't contain both startConsumeFromSequence and lastMessages"));
            }
            let createConsumerReq = {
                name: consumerName,
                station_name: stationName,
                connection_id: this.connectionId,
                consumer_type: 'application',
                consumers_group: consumerGroup,
                max_ack_time_ms: maxAckTimeMs,
                max_msg_deliveries: maxMsgDeliveries,
                start_consume_from_sequence: startConsumeFromSequence,
                last_messages: lastMessages,
                req_version: 1,
                username: this.username
            };
            let data = this.JSONC.encode(createConsumerReq);
            let errMsg = await this.brokerManager.request('$memphis_consumer_creations', data);
            errMsg = errMsg.data.toString();
            if (errMsg != '') {
                throw MemphisError(new Error(errMsg));
            }
            return new Consumer(this, stationName, consumerName, consumerGroup, pullIntervalMs, batchSize, batchMaxTimeToWaitMs, maxAckTimeMs, maxMsgDeliveries, startConsumeFromSequence, lastMessages);
        }
        catch (ex) {
            throw MemphisError(ex);
        }
    }
    headers() {
        return new MsgHeaders();
    }
    async close() {
        var _a;
        for (let key of this.schemaUpdatesSubs.keys()) {
            let sub = this.schemaUpdatesSubs.get(key);
            if (sub)
                sub.unsubscribe();
            this.stationSchemaDataMap.delete(key);
            this.schemaUpdatesSubs.delete(key);
            this.producersPerStation.delete(key);
            this.meassageDescriptors.delete(key);
            this.jsonSchemas.delete(key);
        }
        await ((_a = this.brokerManager) === null || _a === void 0 ? void 0 : _a.close());
        return this.resetVars();
    }
}
exports.Memphis = Memphis;
class MsgHeaders {
    constructor() {
        this.headers = (0, nats_1.headers)();
    }
    add(key, value) {
        if (!key.startsWith('$memphis')) {
            this.headers.append(key, value);
        }
        else {
            throw MemphisError(new Error('Keys in headers should not start with $memphis'));
        }
    }
}
class Producer {
    constructor(connection, producerName, stationName) {
        this.connection = connection;
        this.producerName = producerName.toLowerCase();
        this.stationName = stationName.toLowerCase();
        this.internal_station = this.stationName.replace(/\./g, '#').toLowerCase();
    }
    _handleHeaders(headers) {
        let type;
        if (headers instanceof MsgHeaders) {
            type = "memphisHeaders";
        }
        else if (Object.prototype.toString.call(headers) === "[object Object]") {
            type = "object";
        }
        else {
            throw MemphisError(new Error('headers has to be a Javascript object or an instance of MsgHeaders'));
        }
        switch (type) {
            case "object":
                const msgHeaders = this.connection.headers();
                for (let key in headers)
                    msgHeaders.add(key, headers[key]);
                return msgHeaders.headers;
            case "memphisHeaders":
                return headers.headers;
        }
    }
    async produce({ message, ackWaitSec = 15, asyncProduce = false, headers = new MsgHeaders(), msgId = null }) {
        try {
            let messageToSend = this._validateMessage(message);
            headers = this._handleHeaders(headers);
            headers.set('$memphis_connectionId', this.connection.connectionId);
            headers.set('$memphis_producedBy', this.producerName);
            if (msgId)
                headers.set('msg-id', msgId);
            if (asyncProduce)
                this.connection.brokerConnection.publish(`${this.internal_station}.final`, messageToSend, {
                    headers: headers,
                    ackWait: ackWaitSec * 1000 * 1000000
                });
            else
                await this.connection.brokerConnection.publish(`${this.internal_station}.final`, messageToSend, {
                    headers: headers,
                    ackWait: ackWaitSec * 1000 * 1000000
                });
        }
        catch (ex) {
            await this._hanldeProduceError(ex, message, headers);
        }
    }
    _parseJsonValidationErrors(errors) {
        const errorsArray = [];
        for (const error of errors) {
            if (error.instancePath)
                errorsArray.push(`${error.schemaPath} ${error.message}`);
            else
                errorsArray.push(error.message);
        }
        return errorsArray.join(', ');
    }
    _validateJsonMessage(msg) {
        try {
            let validate = this.connection.jsonSchemas.get(this.internal_station);
            let msgObj;
            let msgToSend = new Uint8Array();
            const isBuffer = Buffer.isBuffer(msg);
            if (isBuffer) {
                try {
                    msgObj = JSON.parse(msg.toString());
                }
                catch (ex) {
                    throw MemphisError(new Error('Expecting Json format: ' + ex));
                }
                msgToSend = msg;
                const valid = validate(msgObj);
                if (!valid) {
                    throw MemphisError(new Error(`${this._parseJsonValidationErrors(validate['errors'])}`));
                }
                return msgToSend;
            }
            else if (Object.prototype.toString.call(msg) == '[object Object]') {
                msgObj = msg;
                let enc = new TextEncoder();
                const msgString = JSON.stringify(msg);
                msgToSend = enc.encode(msgString);
                const valid = validate(msgObj);
                if (!valid) {
                    throw MemphisError(new Error(`${this._parseJsonValidationErrors(validate['errors'])}`));
                }
                return msgToSend;
            }
            else {
                throw MemphisError(new Error('Unsupported message type'));
            }
        }
        catch (ex) {
            throw MemphisError(new Error(`Schema validation has failed: ${ex.message}`));
        }
    }
    _validateProtobufMessage(msg) {
        let meassageDescriptor = this.connection.meassageDescriptors.get(this.internal_station);
        if (meassageDescriptor) {
            if (msg instanceof Uint8Array) {
                try {
                    meassageDescriptor.decode(msg);
                    return msg;
                }
                catch (ex) {
                    if (ex.message.includes('index out of range') || ex.message.includes('invalid wire type')) {
                        ex = new Error('Schema validation has failed: Invalid message format, expecting protobuf');
                    }
                    throw MemphisError(new Error(`Schema validation has failed: ${ex.message}`));
                }
            }
            else if (msg instanceof Object) {
                let errMsg = meassageDescriptor.verify(msg);
                if (errMsg) {
                    throw MemphisError(new Error(`Schema validation has failed: ${errMsg}`));
                }
                const protoMsg = meassageDescriptor.create(msg);
                const messageToSend = meassageDescriptor.encode(protoMsg).finish();
                return messageToSend;
            }
            else {
                throw MemphisError(new Error('Schema validation has failed: Unsupported message type'));
            }
        }
    }
    _validateGraphqlMessage(msg) {
        try {
            let msgToSend;
            let message;
            if (msg instanceof Uint8Array) {
                const msgString = new TextDecoder().decode(msg);
                msgToSend = msg;
                message = (0, graphql_1.parse)(msgString);
            }
            else if (typeof msg == 'string') {
                message = (0, graphql_1.parse)(msg);
                msgToSend = new TextEncoder().encode(msg);
            }
            else if (msg.kind == 'Document') {
                message = msg;
                const msgStr = msg.loc.source.body.toString();
                msgToSend = new TextEncoder().encode(msgStr);
            }
            else {
                throw MemphisError(new Error('Unsupported message type'));
            }
            const schema = this.connection.graphqlSchemas.get(this.internal_station);
            const validateRes = (0, graphql_1.validate)(schema, message);
            if (validateRes.length > 0) {
                throw MemphisError(new Error('Schema validation has failed: ' + validateRes));
            }
            return msgToSend;
        }
        catch (ex) {
            if (ex.message.includes('Syntax Error')) {
                ex = new Error('Schema validation has failed: Invalid message format, expecting GraphQL');
            }
            throw MemphisError(new Error('Schema validation has failed: ' + ex));
        }
    }
    _validateMessage(msg) {
        let stationSchemaData = this.connection.stationSchemaDataMap.get(this.internal_station);
        if (stationSchemaData) {
            switch (stationSchemaData['type']) {
                case 'protobuf':
                    return this._validateProtobufMessage(msg);
                case 'json':
                    return this._validateJsonMessage(msg);
                case 'graphql':
                    return this._validateGraphqlMessage(msg);
                default:
                    return msg;
            }
        }
        else {
            if (Object.prototype.toString.call(msg) == '[object Object]') {
                return Buffer.from(JSON.stringify(msg));
            }
            if (!Buffer.isBuffer(msg)) {
                throw MemphisError(new Error('Unsupported message type'));
            }
            else {
                return msg;
            }
        }
    }
    _getDlsMsgId(stationName, producerName, unixTime) {
        return stationName + '~' + producerName + '~0~' + unixTime;
    }
    async _hanldeProduceError(ex, message, headers) {
        if (ex.code === '503') {
            throw MemphisError(new Error('Produce operation has failed, please check whether Station/Producer still exist'));
        }
        if (ex.message.includes('BAD_PAYLOAD'))
            ex = MemphisError(new Error('Invalid message format, expecting Uint8Array'));
        if (ex.message.includes('Schema validation has failed')) {
            let failedMsg = '';
            if (message instanceof Uint8Array) {
                failedMsg = String.fromCharCode.apply(null, message);
            }
            else {
                failedMsg = JSON.stringify(message);
            }
            if (this.connection.stationSchemaverseToDlsMap.get(this.internal_station)) {
                const unixTime = Date.now();
                const id = this._getDlsMsgId(this.internal_station, this.producerName, unixTime.toString());
                let headersObject = {
                    $memphis_connectionId: this.connection.connectionId,
                    $memphis_producedBy: this.producerName
                };
                const keys = headers.headers.keys();
                keys.forEach((key) => {
                    const value = headers.headers.values(key);
                    headersObject[key] = value[0];
                });
                const buf = this.connection.JSONC.encode({
                    _id: id,
                    station_name: this.internal_station,
                    producer: {
                        name: this.producerName,
                        connection_id: this.connection.connectionId
                    },
                    creation_unix: unixTime,
                    message: {
                        data: stringToHex(failedMsg),
                        headers: headersObject
                    }
                });
                await this.connection.brokerConnection.publish('$memphis-' + this.internal_station + '-dls.schema.' + id, buf);
                if (this.connection.clusterConfigurations.get('send_notification')) {
                    this.connection.sendNotification('Schema validation has failed', `Station: ${this.stationName}\nProducer: ${this.producerName}\nError: ${ex.message}`, failedMsg, schemaVFailAlertType);
                }
            }
        }
        throw MemphisError(ex);
    }
    async destroy() {
        var _a;
        try {
            let removeProducerReq = {
                name: this.producerName,
                station_name: this.stationName,
                username: this.connection.username
            };
            let data = this.connection.JSONC.encode(removeProducerReq);
            let errMsg = await this.connection.brokerManager.request('$memphis_producer_destructions', data);
            errMsg = errMsg.data.toString();
            if (errMsg != '') {
                throw MemphisError(new Error(errMsg));
            }
            const stationName = this.stationName.replace(/\./g, '#').toLowerCase();
            let prodNumber = this.connection.producersPerStation.get(stationName) - 1;
            this.connection.producersPerStation.set(stationName, prodNumber);
            if (prodNumber === 0) {
                let sub = this.connection.schemaUpdatesSubs.get(stationName);
                if (sub)
                    sub.unsubscribe();
                this.connection.stationSchemaDataMap.delete(stationName);
                this.connection.schemaUpdatesSubs.delete(stationName);
                this.connection.meassageDescriptors.delete(stationName);
                this.connection.jsonSchemas.delete(stationName);
            }
        }
        catch (ex) {
            if ((_a = ex.message) === null || _a === void 0 ? void 0 : _a.includes('not exist')) {
                return;
            }
            throw MemphisError(ex);
        }
    }
}
class Consumer {
    constructor(connection, stationName, consumerName, consumerGroup, pullIntervalMs, batchSize, batchMaxTimeToWaitMs, maxAckTimeMs, maxMsgDeliveries, startConsumeFromSequence, lastMessages) {
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
        this.startConsumeFromSequence = startConsumeFromSequence;
        this.lastMessages = lastMessages;
        this.context = {};
    }
    setContext(context) {
        this.context = context;
    }
    on(event, cb) {
        var _a, _b, _c, _d;
        if (event === 'message') {
            const subject = (_a = this.stationName) === null || _a === void 0 ? void 0 : _a.replace(/\./g, '#').toLowerCase();
            const consumerGroup = (_b = this.consumerGroup) === null || _b === void 0 ? void 0 : _b.replace(/\./g, '#').toLowerCase();
            const consumerName = (_c = this.consumerName) === null || _c === void 0 ? void 0 : _c.replace(/\./g, '#').toLowerCase();
            if (this.connection.brokerConnection) {
                (_d = this.connection.brokerConnection) === null || _d === void 0 ? void 0 : _d.pullSubscribe(`${subject}.final`, {
                    mack: true,
                    config: {
                        durable_name: this.consumerGroup ? consumerGroup : consumerName
                    }
                }).then(async (psub) => {
                    var _a;
                    psub === null || psub === void 0 ? void 0 : psub.pull({
                        batch: this.batchSize,
                        expires: this.batchMaxTimeToWaitMs
                    });
                    this.pullInterval = setInterval(() => {
                        var _a;
                        if (!((_a = this.connection.brokerManager) === null || _a === void 0 ? void 0 : _a.isClosed()))
                            psub === null || psub === void 0 ? void 0 : psub.pull({
                                batch: this.batchSize,
                                expires: this.batchMaxTimeToWaitMs
                            });
                        else
                            clearInterval(this.pullInterval);
                    }, this.pullIntervalMs);
                    this.pingConsumerInvterval = setInterval(async () => {
                        var _a;
                        if (!((_a = this.connection.brokerManager) === null || _a === void 0 ? void 0 : _a.isClosed())) {
                            this._pingConsumer();
                        }
                        else
                            clearInterval(this.pingConsumerInvterval);
                    }, this.pingConsumerInvtervalMs);
                    const sub = (_a = this.connection.brokerManager) === null || _a === void 0 ? void 0 : _a.subscribe(`$memphis_dls_${subject}_${consumerGroup}`, {
                        queue: `$memphis_${subject}_${consumerGroup}`
                    });
                    this._handleAsyncIterableSubscriber(psub);
                    this._handleAsyncIterableSubscriber(sub);
                }).catch((error) => this.eventEmitter.emit('error', MemphisError(error)));
            }
        }
        this.eventEmitter.on(event, cb);
    }
    async _handleAsyncIterableSubscriber(iter) {
        var _a, e_4, _b, _c;
        try {
            for (var _d = true, iter_1 = __asyncValues(iter), iter_1_1; iter_1_1 = await iter_1.next(), _a = iter_1_1.done, !_a;) {
                _c = iter_1_1.value;
                _d = false;
                try {
                    const m = _c;
                    this.eventEmitter.emit('message', new Message(m, this.connection, this.consumerGroup), this.context);
                }
                finally {
                    _d = true;
                }
            }
        }
        catch (e_4_1) { e_4 = { error: e_4_1 }; }
        finally {
            try {
                if (!_d && !_a && (_b = iter_1.return)) await _b.call(iter_1);
            }
            finally { if (e_4) throw e_4.error; }
        }
    }
    async _pingConsumer() {
        try {
            const stationName = this.stationName.replace(/\./g, '#').toLowerCase();
            const consumerGroup = this.consumerGroup.replace(/\./g, '#').toLowerCase();
            const consumerName = this.consumerName.replace(/\./g, '#').toLowerCase();
            const durableName = consumerGroup || consumerName;
            await this.connection.brokerStats.consumers.info(stationName, durableName);
        }
        catch (ex) {
            this.eventEmitter.emit('error', MemphisError(new Error('station/consumer were not found')));
        }
    }
    async destroy() {
        var _a;
        clearInterval(this.pullInterval);
        try {
            let removeConsumerReq = {
                name: this.consumerName,
                station_name: this.stationName,
                username: this.connection.username
            };
            let data = this.connection.JSONC.encode(removeConsumerReq);
            let errMsg = await this.connection.brokerManager.request('$memphis_consumer_destructions', data);
            errMsg = errMsg.data.toString();
            if (errMsg != '') {
                throw MemphisError(new Error(errMsg));
            }
        }
        catch (ex) {
            if ((_a = ex.message) === null || _a === void 0 ? void 0 : _a.includes('not exist')) {
                return;
            }
            throw MemphisError(ex);
        }
    }
}
function generateNameSuffix() {
    return [...Array(8)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}
class Message {
    constructor(message, connection, cgName) {
        this.message = message;
        this.connection = connection;
        this.cgName = cgName;
    }
    ack() {
        if (this.message.ack)
            this.message.ack();
        else {
            let buf = this.connection.JSONC.encode({
                id: this.message.headers.get('$memphis_pm_id'),
                sequence: this.message.headers.get('$memphis_pm_sequence')
            });
            this.connection.brokerManager.publish('$memphis_pm_acks', buf);
        }
    }
    getData() {
        const isBuffer = Buffer.isBuffer(this.message.data);
        if (!isBuffer) {
            return Buffer.from(this.message.data);
        }
        else {
            return this.message.data;
        }
    }
    getHeaders() {
        const msgHeaders = {};
        const hdrs = this.message.headers['headers'];
        for (let [key, value] of hdrs) {
            if (key.startsWith("$memphis"))
                continue;
            msgHeaders[key] = value[0];
        }
        return msgHeaders;
    }
    getSequenceNumber() {
        return this.message.seq;
    }
}
class Station {
    constructor(connection, name) {
        this.connection = connection;
        this.name = name.toLowerCase();
    }
    async destroy() {
        var _a;
        try {
            let removeStationReq = {
                station_name: this.name,
                username: this.connection.username
            };
            const stationName = this.name.replace(/\./g, '#').toLowerCase();
            let sub = this.connection.schemaUpdatesSubs.get(stationName);
            if (sub)
                sub.unsubscribe();
            this.connection.stationSchemaDataMap.delete(stationName);
            this.connection.schemaUpdatesSubs.delete(stationName);
            this.connection.producersPerStation.delete(stationName);
            this.connection.meassageDescriptors.delete(stationName);
            this.connection.jsonSchemas.delete(stationName);
            let data = this.connection.JSONC.encode(removeStationReq);
            let errMsg = await this.connection.brokerManager.request('$memphis_station_destructions', data);
            errMsg = errMsg.data.toString();
            if (errMsg != '') {
                throw MemphisError(new Error(errMsg));
            }
        }
        catch (ex) {
            if ((_a = ex.message) === null || _a === void 0 ? void 0 : _a.includes('not exist')) {
                return;
            }
            throw MemphisError(ex);
        }
    }
}
const MemphisInstance = new Memphis();
exports.default = MemphisInstance;
