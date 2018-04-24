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
    //console.log('ADDSTREAM', event);
    startRecording(event.stream, function(res){
        console.log('ADD STREAM: ', event.stream.getID(), 'RECORDING:', res);
    }, function (error) {
        console.log('ADD STREAM ERROR: ', event.stream.getID(), 'ERROR:', error);
    });
};

var onRemoveStream = function(event) {
    console.log('REMOVESTREAM', event.stream.getID(), event.stream.getAttributes().name);
    //TODO: si la grabación se ha detenido, no se llegarán a registrar estos eventos, evitar realizar la llamada?
    let stream = event.stream;
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
            console.log('REMOVED STREAM: ', stream.getID(), res);
            delete streamsRecording[stream.getID()];
        }, function (err){
            console.log('ERROR REMOVING STREAM: ', stream.getID(), err);
            delete streamsRecording[stream.getID()];
        });
};

var onStreamSubscribed = function(event) {
    console.log('STREAMSUBSCRIBED', event);
};

var onData = function(event) {
    console.log('DATA', event);
};

var getIDSala = function(roomID) {
    let idSala = -1;
    Object.keys(roomsRecording).forEach(function(index) {
        console.log('FILTERING', roomsRecording[index].roomID, roomID);
        if(roomsRecording[index].roomID === roomID){
            console.log('ID_SALA', index);
            idSala = index;
            return index;
        };
    });
    return idSala;
};

var initRecording = function(room, stream, callback, callbackError) {
    // console.log('INITRECORDING-ROOM', room);
    // console.log('INITRECORDING-STREAM', stream);
    if(streamsRecording[stream.getID()]) {
        console.log('Already recording stream', stream.getID(), streamsRecording[stream.getID()]);
        callbackError('Already recording stream');
    }

    room.startRecording(stream, function(id, error) {
        if(id !== undefined) {
            console.log('INIT STREAM: ', stream.getID(), 'RECORDING:', id);
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
            console.log('INIT STREAM ERROR: ', stream.getID(), 'ERROR:', error);
            callbackError(error);
        }
    });
};

var startRecording = function(stream, callback, callbackError) {
    //console.log('STARTRECORDING', stream);
    if(streamsRecording[stream.getID()]) {
        console.log('Already recording stream', stream.getID(), streamsRecording[stream.getID()]);
        callbackError('Already recording stream');
    }

    stream.room.startRecording(stream, function(id, error) {
        if(id !== undefined) {
            console.log('START STREAM: ', stream.getID(), 'RECORDING:', id);
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
            console.log('START STREAM ERROR: ', stream.getID(), 'ERROR:', error);
            callbackError(error);
        }
    });
};

var stopRecording = function(room, stream, callback, callbackError) {
    console.log('STOPRECORDING', stream.getID(), stream.getAttributes().name);
    //TODO: check if not recording?
    room.stopRecording(streamsRecording[stream.getID()].nameStream, function(id) {
        callback(id);
    }, function (err) {
        console.log('ERROR STOPPED STREAM: ', stream.getID(), 'ERROR:', err);
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
           console.log('ERROR', error);
           callbackError(false);
       }
       else if(response.statusCode === 200){
           callback(response.body);
       }
       else {
           console.log('BODY ERROR' , response.statusCode, body);
           callbackError(false);
       }
    });
};

app.post('/record/stop', function(req, res) {
    console.log('Stopping recording: ', req.body);

    if(!req.body.idSala){
        console.log('Missing required parameter idSala');
        res.status(422).send('Missing required parameter');
        return;
    }

    let room = roomsRecording[req.body.idSala];

    if(typeof roomsRecording[req.body.idSala] === 'undefined') {
        console.log('Sala not recording');
        res.status(409).send({result: 'Not recording'});
        return;
    } else if (roomsRecording[req.body.idSala].roomID === 'unloading') {
        // roomsRecording[req.body.idSala] = {roomID: 'stuck'};
        console.log('Sala already stopping');
        res.status(409).send({result: 'Already stopping', data: roomsRecording[req.body.idSala].roomID});
        return;
    } else if (roomsRecording[req.body.idSala].roomID === 'loading') {
        console.log('Sala just starting recording');
        res.status(409).send({result: 'Just started recording', data: roomsRecording[req.body.idSala].roomID});
        return;
    }
    else if (room.state !== 2) {
        console.log('Not connected to Room');
        res.status(409).send({result: 'Not connected to Room', data: roomsRecording[req.body.idSala].roomID});
        return;
    }
    else { //Evitar condiciones de carrera
        //roomsRecording[req.body.idSala] = {roomID: 'unloading'};
    }

    var disconnect = function(){
        setTimeout(function () {
            console.log('DISCONNECT', room.roomID);
            room.disconnect();
            console.log('DELETE FROM GLOBAL LIST');
            delete roomsRecording[req.body.idSala];
            res.status(200).send({result: 'OK', roomID: room.roomID, idSala: req.body.idSala});

        }, 1000);
    };

    var numStopped = 0;
    if (numStopped === room.remoteStreams.keys().length) {
        disconnect();
    }
    room.remoteStreams.forEach(function(value, index) {
        //console.log('STREAM', index, value);
        stopRecording(room, value, function (result) {
            if (result === true) {
                ++numStopped;
            }
            if (numStopped === room.remoteStreams.keys().length) {
                console.log('ALL STOPPED', numStopped, room.remoteStreams.keys().length);
                disconnect();
            }
            else {
                console.log('STOPPED', numStopped, room.remoteStreams.keys().length);
            }

        }, function (err) {
            console.log('ERROR STOPPING', value, err);
            res.status(500).send({result: 'Error stopping recordings', stream: value.getID()});
        });
    });
});

var createToken = function (roomId, idSala, res) {
    console.log('Creating token', roomId, idSala);
    N.API.createToken(roomId, 'recorder', 'presenter', function(token) {
        console.log('Token ready', token);
        connect(token, idSala, function(value) {
            if(res) {
                res.status(200).send({result: 'OK', token: token, idSala: idSala, streams: value});
            }
        }, function (error) {
            if(res) {
                res.status(500).send({result: 'Error initiating recording', error: error});
            }
            console.error('Error initiating recording');
        });

    }, function(error) {
        console.log('Error creating token', error);
        delete roomsRecording[req.body.idSala];
        if(res) {
            res.status(401).send({result: 'Error creating token', error: error});
        }
        console.error('Error creating token');
    });
};

var getRoom = function (name, callback, res) {
    N.API.getRooms(function (roomlist){
        const rooms = JSON.parse(roomlist);
        for (var room of rooms) {
            if (room.name === name){
                callback(room._id, name, res);
                return;
            }
        }

        console.log('Room not found', name);
        if(res) {
            res.status(404).send('Room not found');
        }
    }, function(error){
        console.log('GET ROOM ERROR: ', error);
        delete roomsRecording[req.body.idSala];
        if(res) {
            res.status(401).send({result: 'Error getting room', error: error});
        }
    });
};

app.post('/record/start', function(req, res) {
    console.log('Starting recording: ',req.body);

    if(!req.body.idSala){
        console.log('Missing required parameter idSala');
        res.status(422).send('Missing required parameter');
        return;
    }
    if(roomsRecording[req.body.idSala]) {
        console.log('Sala already recording');
        res.status(409).send({result: 'Already recording', data: roomsRecording[req.body.idSala].roomID});
        return;
    } else { //Evitar condiciones de carrera
        roomsRecording[req.body.idSala] = {roomID: 'loading'};
    }



    getRoom(+req.body.idSala, createToken, res);
});

app.get('/record/list', function(req, res) {
    let result = {};
    result.roomsRecording = {};
    Object.keys(roomsRecording).forEach(function(key) {
        let streams = [];
        roomsRecording[key].remoteStreams.forEach(function(value, index) {
            streams.push(streamsRecording[value.getID()]);
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
        //console.log('CONNECTED', event);
        console.log('CONNECTED TO ROOM: ', room.roomID);

        let initiated = 0;
        if(event.streams.length === 0) {
            callback(initiated);
        }
        for(let s of event.streams) {
            //console.log('STREAM1', s.getID());
            initRecording(room, s, function(value) {
                console.log('RECORDING INITIATED: ', initiated , value);
                if(++initiated === event.streams.length){
                    callback(initiated);
                }
            }, callbackError);
        }
    });
    room.addEventListener('stream-added', onAddStream);
    room.addEventListener('stream-removed', onRemoveStream);
    //room.addEventListener('stream-subscribed', onStreamSubscribed);
    room.connect();

    //Guardar la sala en el ámbito global para poder monitorizarlas
    //roomsRecording[room.roomID] = room;
    roomsRecording[idSala] = room;
    //console.log('ROOM', room);
};

//Inicializa grabaciones en curso
remoteCall('GET', process.env.API + 'nsr/record', {},
    function (res) {
    console.log(res);

        for(let sala of res) {
        //res.forEach(function(sala, index) {
            roomsRecording[sala.ID_Sala] = {roomID: 'loading'};
            console.log('SALA GRABANDO ANTERIORMENTE: ', sala);
            getRoom(+sala.ID_Sala, createToken, null);
        }
    }, function (err){
        console.log('ERROR CARGANDO SALA GRABANDO: ', err);
    });

app.listen(3002);

