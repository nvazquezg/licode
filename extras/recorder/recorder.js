/*global require, __dirname, console*/
'use strict';
var express = require('express'),
    bodyParser = require('body-parser'),
    errorhandler = require('errorhandler'),
    morgan = require('morgan'),
    N = require('./nuve'),
    fs = require('fs'),
    config = require('./../../licode_config'),
    newIo = require('socket.io-client'),
    Erizo = require('./erizofc'),
    request = require('request');

const logger = require('../../spine/logger').logger;
const log = logger.getLogger('Recorder');

const nativeConnectionHelpers = require('../../spine/NativeConnectionHelpers');
const nativeConnectionManager = require('../../spine/NativeConnectionManager.js');

var options = {
    key: fs.readFileSync('../../cert/key.pem').toString(),
    cert: fs.readFileSync('../../cert/cert.pem').toString()
};

if (config.erizoController.sslCaCerts) {
    options.ca = [];
    for (var ca in config.erizoController.sslCaCerts) {
        options.ca.push(fs.readFileSync(config.erizoController.sslCaCerts[ca]).toString());
    }
}

//TODO: Vbles a mongo?
var roomsRecording = {};
var streamsRecording = {};
var host = '';

var app = express();

// app.configure ya no existe
app.use(errorhandler({
    dumpExceptions: true,
    showStack: true
}));
app.use(morgan('dev'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true
}));
app.use(function(req, res, next) {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});


//app.set('views', __dirname + '/../views/');
//disable layout
//app.set("view options", {layout: false});

N.API.init(config.nuve.superserviceID, config.nuve.superserviceKey, 'http://localhost:3000/');

var onAddStream = function(event) {
    let idSala = getIDSala(event.stream.room.roomID);
    if (event.stream.local) {
        log.info('LOCAL STREAM: ', event.stream.getID());
        sendStreamData(idSala, {type: 'Recorder', action: {idType: 1004, name: 'Recorder local stream OK'}, nickname: 'recorder-status'});
    } else {
        startRecording(event.stream, function (res) {
            log.info('ADD STREAM: ', event.stream.getID(), 'RECORDING:', res);
        }, function (error) {
            log.info('ADD STREAM ERROR: ', event.stream.getID(), 'ERROR:', error);
        });
    }
};

var onRemoveStream = function(event) {
    log.info('REMOVESTREAM', event.stream.getID(), event.stream.getAttributes().name, 'SCREEN:', event.stream.hasScreen());
    //TODO: si la grabación se ha detenido, no se llegarán a registrar estos eventos, evitar realizar la llamada?
    let stream = event.stream;
    if(!streamsRecording[stream.getID()]) { //Si el stream no está definido no hay que insertar nada
        return;
    }
    let params =
        {
            "Tipo_Evento": (stream.hasScreen() === true ? 63 : 12),
            "params": JSON.stringify({
                "user": {
                    "perfil": "presenter",
                    "UID": stream.getID(),
                    "name": stream.getAttributes().name
                },
                "nameStream": streamsRecording[stream.getID()].nameStream,
                "name": (stream.hasScreen() === true ? "onDestroyDesktop" : "onDestroyVideoPod"),
                "host": host
            })
        };
    remoteCall('POST', process.env.API + 'nsr/record/' + streamsRecording[stream.getID()].roomKey + '/autoEvent', params, streamsRecording[stream.getID()].roomKey,
        function (res) {
            log.info('REMOVED STREAM: ', stream.getID());
            sendStreamData(streamsRecording[stream.getID()].roomKey, {type: 'Recorder', action: {idType: 1007, name: 'Removed stream OK', streamId: stream.getID()}, nickname: 'recorder-status'});
            delete streamsRecording[stream.getID()];
        }, function (err){
            log.info('ERROR REMOVING STREAM: ', stream.getID(), err);
            sendStreamData(streamsRecording[stream.getID()].roomKey, {type: 'Recorder', action: {idType: 1005, name: 'Error removing stream', streamId: stream.getID()}, nickname: 'recorder-status'});
            delete streamsRecording[stream.getID()];
        });
};

var onStreamSubscribed = function(event) {
    log.info('STREAMSUBSCRIBED', event);
};

var onData = function(event) {
    log.info('DATA', event);
};

var getIDSala = function(roomID) {
    let idSala = -1;
    Object.keys(roomsRecording).forEach(function(index) {
        if(roomsRecording[index].roomID === roomID){
            idSala = index;
            return index;
        };
    });
    return idSala;
};

var initRecording = function(room, stream, callback, callbackError) {
    // log.info('INITRECORDING-ROOM', room);
    // log.info('INITRECORDING-STREAM', stream);
    if(streamsRecording[stream.getID()]) {
        log.info('Already recording stream on init: ' + stream.getID() + ' ' + streamsRecording[stream.getID()]);
        callback('Already recording stream on init: ' + stream.getID() + ' ' + streamsRecording[stream.getID()]);
        return;
    } else if (!stream.hasAudio() && !stream.hasVideo() && !stream.hasScreen()) {
        log.info('Stream has nothing to record on init: ' + stream.getID());
        callback('Stream has nothing to record on init: ' + stream.getID());
        return;
    }

    room.startRecording(stream, function(id, error) {
        if(id !== undefined) {
            log.info('INIT STREAM: ', stream.getID(), 'RECORDING:', id, 'SCREEN:', stream.hasScreen());
            let idSala = getIDSala(room.roomID);
            streamsRecording[stream.getID()] = {nameStream: id, roomKey: idSala};
            //TODO: PARAMETRIZE
            let params =
                {
                    "Tipo_Evento": (stream.hasScreen() === true ? 62 : 11),
                    "params": JSON.stringify({
                        "user": {
                            "perfil": "presenter",
                            "UID": stream.getID(),
                            "name": stream.getAttributes().name
                        },
                        "nameStream": id,
                        "name": (stream.hasScreen() === true ? "onCreateDesktop": "onCreateVideoPod"),
                        "host": host
                    })
                };

            remoteCall('POST', process.env.API + 'nsr/record/' + idSala + '/autoEvent', params, idSala,
                function (res) {
                    checkRecordingFile(id, stream.getID(), idSala, callback, callbackError);
                }, function (err) {
                    callbackError(err);
                });
        }
        else {
            log.info('INIT STREAM ERROR: ', stream.getID(), 'ERROR:', error);
            callbackError(error);
        }
    });
};

var startRecording = function(stream, callback, callbackError) {
    //log.info('STARTRECORDING', stream);
    if(streamsRecording[stream.getID()]) {
        log.info('Already recording stream: ' + stream.getID() + ' ' + streamsRecording[stream.getID()]);
        callback('Already recording stream: ' + stream.getID() + ' ' + streamsRecording[stream.getID()]);
        return;
    } else if (!stream.hasAudio() && !stream.hasVideo() && !stream.hasScreen()) {
        log.info('Stream has nothing to record: ' + stream.getID());
        callback('Stream has nothing to record: ' + stream.getID());
        return;
    }

    stream.room.startRecording(stream, function(id, error) {
        if(id !== undefined) {
            log.info('START STREAM: ', stream.getID(), 'RECORDING:', id , 'SCREEN:', stream.hasScreen());
            let idSala = getIDSala(stream.room.roomID);
            streamsRecording[stream.getID()] = {nameStream: id, roomKey: idSala};
            //TODO: PARAMETRIZE
            let params =
                {
                    "Tipo_Evento": (stream.hasScreen() === true ? 62 : 11),
                    "params": JSON.stringify({
                        "user": {
                            "perfil": "presenter",
                            "UID": stream.getID(),
                            "name": stream.getAttributes().name
                        },
                        "nameStream": id,
                        "name": (stream.hasScreen() === true ? "onCreateDesktop" : "onCreateVideoPod"),
                        "host": host
                    })
                };

            remoteCall('POST', process.env.API + 'nsr/record/' + idSala + '/autoEvent', params, idSala,
                function (res) {
                    checkRecordingFile(id, stream.getID(), idSala, callback, callbackError);
                }, function (err) {
                    callbackError(err);
                });

        }
        else {
            log.info('START STREAM ERROR: ', stream.getID(), 'ERROR:', error);
            callbackError(error);
        }
    });
};

var stopRecording = function(room, stream, callback, callbackError) {
    log.info('STOPRECORDING', stream.getID(), stream.getAttributes().name);
    if(!streamsRecording[stream.getID()]) { //Si el stream no está definido no hay que detener nada
        callback(true);
        return;
    }
    //TODO: check if not recording?
    room.stopRecording(streamsRecording[stream.getID()].nameStream, function(id) {
        sendStreamData(getIDSala(room.roomID),{type: 'Recorder', action: {idType: 1004, name: 'Recording stopped OK', msg: id}, nickname: 'recorder-status'});
        callback(id);
    }, function (err) {
        log.info('ERROR STOPPED STREAM: ', stream.getID(), 'ERROR:', err);
        sendStreamData(getIDSala(room.roomID), {type: 'Recorder', action: {idType: 1005, name: 'Recording stopped Error', msg: err}, nickname: 'recorder-status'});
        callbackError(false);
    });
};

var sendStreamData = function(idSala, action) {
    if (roomsRecording[idSala] && roomsRecording[idSala].myStream) {
        roomsRecording[idSala].myStream.sendData(action);
    } else if (idSala !== -1) {
        log.error('UNABLE TO SEND STREAM DATA', idSala, action);
    }
};

var remoteCall = function(method, url, body, idSala, callback, callbackError) {
    request({
        method: method,
        uri: url,
        form: body,
        json: true
    }, function (error, response, body) {
       if(error) {
           log.info('ERROR', error);
           sendStreamData(idSala, {type: 'Recorder', action: {idType: 1005, name: 'Remote call Failed', msg: error}, nickname: 'recorder-status'});
           callbackError(false);
       }
       else if(response.statusCode === 200){
           sendStreamData(idSala, {type: 'Recorder', action: {idType: 1004, name: 'Remote call OK', msg: body}, nickname: 'recorder-status'});
           callback(response.body);
       }
       else {
           log.info('BODY ERROR' , response.statusCode, body);
           sendStreamData(idSala, {type: 'Recorder', action: {idType: 1005, name: 'Remote call body Error', msg: body}, nickname: 'recorder-status'});
           callbackError(false);
       }
    });
};

var checkRecordingFile = function (id, streamId, idSala, callback, callbackError) {
    let retries = 1;
    let checkFileInterval = setInterval( function () {
        log.info('CHECK RECORDING EXISTS: ' + config.erizoController.recording_path + id + '.mkv');
        fs.access(config.erizoController.recording_path + id + '.mkv', fs.constants.F_OK, function(err) {
            if (err) {
                log.info('RECORDING DOESNT EXIST YET: ' + config.erizoController.recording_path + id + '.mkv');
                if (retries > 10) {
                    log.error('FAILED TO START RECORDING STREAM: ' + config.erizoController.recording_path + id + '.mkv');
                    clearInterval(checkFileInterval);
                    sendStreamData(idSala, {type: 'Recorder', action:
                            {idType: 1005, name: 'Failed to start recording stream', msg: config.erizoController.recording_path + id + '.mkv', streamId: streamId}, nickname: 'recorder-status'});
                    callbackError(err);
                }
                retries++;
            } else {
                log.info('RECORDING EXISTS: ' + config.erizoController.recording_path + id + '.mkv');
                clearInterval(checkFileInterval);
                sendStreamData(idSala, {type: 'Recorder', action:
                        {idType: 1006, name: 'Start recording stream OK', msg: config.erizoController.recording_path + id + '.mkv', streamId: streamId}, nickname: 'recorder-status'});
                callback(id);
            }
        });
    }, 2000);
};

var publish = function (idSala, room, callback, callbackError) {
    roomsRecording[idSala].myStream = Erizo.Stream(nativeConnectionHelpers, {
        audio: false,
        video: false,
        data: true,
        attributes: {name: 'Recorder-data'}
    });

    roomsRecording[idSala].myStream.addEventListener('access-accepted', (event) => {
        log.info('access-accepted');
        room.publish(roomsRecording[idSala].myStream);
    });
    roomsRecording[idSala].myStream.addEventListener('access-denied', (event) => {
        log.error('access-denied', roomsRecording[idSala].myStream);
    });

    roomsRecording[idSala].myStream.init();
};

app.post('/record/stop', function(req, res) {
    log.info('Stopping recording: ', req.body);

    if(!req.body.idSala){
        log.info('Missing required parameter idSala');
        res.status(422).send('Missing required parameter');
        return;
    }

    let room = roomsRecording[req.body.idSala];

    if(typeof roomsRecording[req.body.idSala] === 'undefined') {
        log.info('Sala not recording');
        res.status(409).send({result: 'Not recording'});
        return;
    } else if (roomsRecording[req.body.idSala].roomID === 'unloading') {
        // roomsRecording[req.body.idSala] = {roomID: 'stuck'};
        log.info('Sala already stopping');
        res.status(409).send({result: 'Already stopping', data: roomsRecording[req.body.idSala].roomID});
        return;
    } else if (roomsRecording[req.body.idSala].roomID === 'loading') {
        log.info('Sala just starting recording');
        res.status(409).send({result: 'Just started recording', data: roomsRecording[req.body.idSala].roomID});
        return;
    }
    else if (room.state !== 2) {
        log.info('Not connected to Room');
        res.status(409).send({result: 'Not connected to Room', data: roomsRecording[req.body.idSala].roomID});
        return;
    }
    else { //Evitar condiciones de carrera
        //roomsRecording[req.body.idSala] = {roomID: 'unloading'};
    }

    var disconnect = function(){
        setTimeout(function () {
            sendStreamData(req.body.idSala, {type: 'Recorder', action: {idType: 1004, name: 'Disconnecting'}, nickname: 'recorder-status'});
            roomsRecording[req.body.idSala].myStream.removeEventListener('access-accepted');
            roomsRecording[req.body.idSala].myStream.removeEventListener('access-denied');
            log.info('DISCONNECT', room.roomID);
            room.disconnect();
            log.info('DELETE FROM GLOBAL LIST');
            delete roomsRecording[req.body.idSala];
            res.status(200).send({result: 'OK', roomID: room.roomID, idSala: req.body.idSala});

        }, 1000);
    };

    var numStopped = 0;
    if (numStopped === room.remoteStreams.keys().length) {
        disconnect();
    }
    room.remoteStreams.forEach(function(value, index) {
        //log.info('STREAM', index, value);
        stopRecording(room, value, function (result) {
            if (result === true) {
                ++numStopped;
            }
            if (numStopped === room.remoteStreams.keys().length) {
                log.info('ALL STOPPED', numStopped, room.remoteStreams.keys().length);
                sendStreamData(req.body.idSala, {type: 'Recorder', action: {idType: 1004, name: 'All streams stopped'}, nickname: 'recorder-status'});
                disconnect();
            }
            else {
                log.info('STOPPED', numStopped, room.remoteStreams.keys().length);
            }

        }, function (err) {
            log.info('ERROR STOPPING', value, err);
            sendStreamData(req.body.idSala, {type: 'Recorder', action: {idType: 1005, name: 'Error stopping recordings'}, nickname: 'recorder-status'});
            res.status(500).send({result: 'Error stopping recordings', stream: value.getID()});
        });
    });
});

var createToken = function (roomId, idSala, final, error) {
    log.info('Creating token', roomId, idSala);
    N.API.createToken(roomId, 'recorder', 'presenter', function(token) {
        log.info('Token ready', token);
        connect(token, idSala, function(value) {
            log.info('Conection OK');
            sendStreamData(idSala, {type: 'Recorder', action: {idType: 1004, name: 'Connection OK'}, nickname: 'recorder-status'});
            final({code: 200, result: 'OK', token: token, idSala: idSala, streams: value});
        }, function (err) {
            log.error('Error connecting to room for recording');
            sendStreamData(idSala, {type: 'Recorder', action: {idType: 1004, name: 'Connection Error', msg: err}, nickname: 'recorder-status'});
            error({code: 500, result: 'Error connecting to room for recording', error: err});
        });

    }, function(err) {
        log.error('Error creating token', err);
        delete roomsRecording[req.body.idSala];
        error({code: 401, result: 'Error creating token', error: err});
    });
};

var getRoom = function (name, callback, final, error) {
    N.API.getRooms(function (roomlist){
        const rooms = JSON.parse(roomlist);
        for (var room of rooms) {
            if (room.name === name){
                callback(room._id, name, final, error);
                return;
            }
        }
        log.error('Room not found', name);
        error({code: 404, result: 'Room not found: ' + name});
    }, function(err){
        log.error('GET ROOM ERROR: ', error);
        delete roomsRecording[req.body.idSala];
        error({code: 401, result: 'Error getting room', error: err});
    });
};

app.post('/record/start', function(req, res) {
    log.info('Starting recording: ',req.body);

    if(!req.body.idSala){
        log.info('Missing required parameter idSala');
        res.status(422).send('Missing required parameter');
        return;
    }
    if(roomsRecording[req.body.idSala]) {
        log.info('Sala already recording');
        res.status(409).send({result: 'Already recording', data: roomsRecording[req.body.idSala].roomID});
        return;
    } else { //Evitar condiciones de carrera
        roomsRecording[req.body.idSala] = {roomID: 'loading', remoteStreams: []};
    }

    getRoom(+req.body.idSala, createToken, function(result) {
        res.status(result.code).send(result);
    }, function (err) {
        log.error("Falló el inicio de grabación");
        if (!res.headersSent) {
            res.status(err.code).send({result: err.result, error: err.error});
        }
    });
});

app.get('/record/list', function(req, res) {
    let result = {};
    result.roomsRecording = {};
    Object.keys(roomsRecording).forEach(function(key) {
        let streams = [];
        roomsRecording[key].remoteStreams.forEach(function(value, index) {
            if(streamsRecording[value.getID()]) {
                streams.push(streamsRecording[value.getID()]);
            }
        });
        result.roomsRecording[key] = {
            roomID: roomsRecording[key].roomID,
            streams: streams
        };
    });
    res.status(200).send(result);
});

app.use(function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS, DELETE');
    res.header('Access-Control-Allow-Headers', 'origin, content-type');
    if (req.method === 'OPTIONS') {
        res.send(200);
    } else {
        next();
    }
});

var connect = function(token, idSala, callback, callbackError) {
    const b64 = JSON.parse(Buffer.from(token, 'base64'));
    host = b64.host;
    log.info("HOST", host);

    let room = Erizo.Room(newIo, nativeConnectionHelpers, nativeConnectionManager, { token });

    let interval = null;

    //room-connected no trae room definido, así que se implementa aquí la función para tener room en el ámbito
    room.addEventListener("room-connected", function(event) {
        roomsRecording[idSala] = room;
        //log.info('CONNECTED', event);
        log.info('CONNECTED TO ROOM: ', room.roomID);

        publish(idSala, room);

        let initiated = 0;
        if(event.streams.length === 0) {
            callback(initiated);
        }
        for(let s of event.streams) {
            //log.info('STREAM1', s.getID());
            initRecording(room, s, function(value) {
                log.info('RECORDING INITIATED: ', initiated , value);
                if(++initiated === event.streams.length){
                    callback(initiated);
                }
            }, callbackError);
        }

        //Programar la comprobación de grabación en curso
        interval = setInterval(checkRecordingLength, 300000, idSala);
    });
    room.addEventListener("room-disconnected", function(event) {
        log.info("room-disconnected");
        if(interval !== null) {
            clearInterval(interval);
        }
    });
    room.addEventListener("room-error", function(event) {
        log.error("room-error", event);
    });
    room.addEventListener('stream-added', onAddStream);
    room.addEventListener('stream-removed', onRemoveStream);
    //room.addEventListener('stream-subscribed', onStreamSubscribed);
    room.connect({singlePC: true});

    //Guardar la sala en el ámbito global para poder monitorizarlas
    //roomsRecording[room.roomID] = room;

    //log.info('ROOM', room);
};

//Inicializa grabaciones en curso
var resumeRecording = function(sala){
    log.info('Resume: ', sala);
    getRoom(sala.ID_Sala, createToken, function(result) {
        log.info("Resume OK: " + result.code);
    }, function (err) {
        if(err.code === 404){
            log.error("La sala no se encuentra en este servidor");
            roomsRecording[sala.ID_Sala].roomID = 'in other recorder';
        } else {
            log.error("Falló el inicio de grabación" + err.err);
        }
    });
};

var checkRecordingLength = function(idSala) {
    remoteCall('GET', process.env.API + 'nsr/record/' + idSala + '/checkLength', {}, idSala,
        function (res) {
            log.info("Check length " + idSala, res);
        },
        function (err) {
            log.error("Error checking length " + idSala, err);
        });
};

remoteCall('GET', process.env.API + 'nsr/record', {}, -1,
    function (res) {
        log.info(res);

        for(let sala of res) {
            roomsRecording[sala.ID_Sala] = {roomID: 'loading', remoteStreams:[]};
            resumeRecording(sala);
            setTimeout(function() {
                log.info("CHECK RECORDING STARTED");
                if( roomsRecording[sala.ID_Sala].roomID === 'loading' ){
                    log.error("CHECK RECORDING FAILED, I'LL BE BACK");
                    process.exit(-1);
                }
                else {
                    log.info("CHECK RECORDING OK");
                }
            }, 10000);
        }
    }, function (err){
        log.error('ERROR RESUMING: ', err);
    });

app.listen(3002);

