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
    //log.info('ADDSTREAM', event);
    startRecording(event.stream, function(res){
        log.info('ADD STREAM: ', event.stream.getID(), 'RECORDING:', res);
    }, function (error) {
        log.info('ADD STREAM ERROR: ', event.stream.getID(), 'ERROR:', error);
    });
};

var onRemoveStream = function(event) {
    log.info('REMOVESTREAM', event.stream.getID(), event.stream.getAttributes().name);
    //TODO: si la grabación se ha detenido, no se llegarán a registrar estos eventos, evitar realizar la llamada?
    let stream = event.stream;
    if(!streamsRecording[stream.getID()]) { //Si el stream no está definido no hay que insertar nada
        return;
    }
    let params =
        {
            "Tipo_Evento": 12,
            "params": JSON.stringify({
                "user": {
                    "perfil": "presenter",
                    "UID": stream.getID(),
                    "name": stream.getAttributes().name
                },
                "nameStream": streamsRecording[stream.getID()].nameStream,
                "name": "onDestroyVideoPod"
            })
        };
    remoteCall('POST', process.env.API + 'nsr/record/' + streamsRecording[stream.getID()].roomKey + '/autoEvent', params,
        function (res) {
            log.info('REMOVED STREAM: ', stream.getID(), res);
            delete streamsRecording[stream.getID()];
        }, function (err){
            log.info('ERROR REMOVING STREAM: ', stream.getID(), err);
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
        log.info('FILTERING', roomsRecording[index].roomID, roomID);
        if(roomsRecording[index].roomID === roomID){
            log.info('ID_SALA', index);
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
        log.info('Already recording stream', stream.getID(), streamsRecording[stream.getID()]);
        callbackError('Already recording stream');
        return;
    } else if (!stream.hasAudio() && !stream.hasVideo() && !stream.hasScreen()) {
        log.info('Stream has nothing to record');
        callbackError('Stream has nothing to record');
        return;
    }

    room.startRecording(stream, function(id, error) {
        if(id !== undefined) {
            log.info('INIT STREAM: ', stream.getID(), 'RECORDING:', id);
            let idSala = getIDSala(room.roomID);
            streamsRecording[stream.getID()] = {nameStream: id, roomKey: idSala};
            //TODO: PARAMETRIZE
            let params =
                {
                    "Tipo_Evento": 11,
                    "params": JSON.stringify({
                        "user": {
                            "perfil": "presenter",
                            "UID": stream.getID(),
                            "name": stream.getAttributes().name
                        },
                        "nameStream": id,
                        "name": "onCreateVideoPod"
                    })
                };

            remoteCall('POST', process.env.API + 'nsr/record/' + idSala + '/autoEvent', params,
                function (res) {
                    callback(id);
                }, function (err){
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
        log.info('Already recording stream', stream.getID(), streamsRecording[stream.getID()]);
        callbackError('Already recording stream');
        return;
    } else if (!stream.hasAudio() && !stream.hasVideo() && !stream.hasScreen()) {
        log.info('Stream has nothing to record');
        callbackError('Stream has nothing to record');
        return;
    }

    stream.room.startRecording(stream, function(id, error) {
        if(id !== undefined) {
            log.info('START STREAM: ', stream.getID(), 'RECORDING:', id);
            let idSala = getIDSala(stream.room.roomID);
            streamsRecording[stream.getID()] = {nameStream: id, roomKey: idSala};
            //TODO: PARAMETRIZE
            let params =
                {
                    "Tipo_Evento": 11,
                    "params": JSON.stringify({
                        "user": {
                            "perfil": "presenter",
                            "UID": stream.getID(),
                            "name": stream.getAttributes().name
                        },
                        "nameStream": id,
                        "name": "onCreateVideoPod"
                    })
                };

            remoteCall('POST', process.env.API + 'nsr/record/' + idSala + '/autoEvent', params,
                function (res) {
                    callback(id);
                }, function (err){
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
    //TODO: check if not recording?
    room.stopRecording(streamsRecording[stream.getID()].nameStream, function(id) {
        callback(id);
    }, function (err) {
        log.info('ERROR STOPPED STREAM: ', stream.getID(), 'ERROR:', err);
        callbackError(false);
    });
};

var remoteCall = function(method, url, body, callback, callbackError) {
    request({
        method: method,
        uri: url,
        form: body,
        json: true
    }, function (error, response, body) {
       if(error) {
           log.info('ERROR', error);
           callbackError(false);
       }
       else if(response.statusCode === 200){
           callback(response.body);
       }
       else {
           log.info('BODY ERROR' , response.statusCode, body);
           callbackError(false);
       }
    });
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
                disconnect();
            }
            else {
                log.info('STOPPED', numStopped, room.remoteStreams.keys().length);
            }

        }, function (err) {
            log.info('ERROR STOPPING', value, err);
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
            final({code: 200, result: 'OK', token: token, idSala: idSala, streams: value});
        }, function (err) {
            log.error('Error connecting to room for recording');
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
        res.status(err.code).send({result: err.result, error: err.error});
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
    let room = Erizo.Room(newIo, nativeConnectionHelpers, nativeConnectionManager, { token });

    //room-connected no trae room definido, así que se implementa aquí la función para tener room en el ámbito
    room.addEventListener("room-connected", function(event) {
        roomsRecording[idSala] = room;
        //log.info('CONNECTED', event);
        log.info('CONNECTED TO ROOM: ', room.roomID);

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
    });
    room.addEventListener("room-disconnected", function(event) {
        log.info("room-disconnected");
    });
    room.addEventListener("room-error", function(event) {
        log.error("room-error", event);
    });
    room.addEventListener('stream-added', onAddStream);
    room.addEventListener('stream-removed', onRemoveStream);
    //room.addEventListener('stream-subscribed', onStreamSubscribed);
    room.connect();

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
        log.error("Falló el inicio de grabación" + err);
    });
};

remoteCall('GET', process.env.API + 'nsr/record', {},
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

