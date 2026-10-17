const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mqtt = require('mqtt');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    methods: ["GET", "POST"]
});

// Mantém a leitura de arquivos estáticos da pasta public se você utilizá-la
app.use(express.static('public'));

// NOVO: Rota com correção dinâmica para encontrar o index.html sem dar erro ENOENT
app.get('/', (req, res) => {
    let caminhoHtml = path.join(__dirname, 'index.html');

    // Se não achar o arquivo na pasta atual, procura na pasta de cima automaticamente
    if (!fs.existsSync(caminhoHtml)) {
        caminhoHtml = path.join(__dirname, '..', 'index.html');
    }

    res.sendFile(caminhoHtml);
});

const mqttClient = mqtt.connect('mqtt://10.68.74.224:1883');
let mqttConectado = false;
let ultimaLeituraVagas = null;
let ultimoStatusSemaforos = null;

mqttClient.on('connect', () => {
    mqttConectado = true;
    console.log('✅ Node.js se conectou com sucesso ao Mosquitto local!');
    mqttClient.subscribe([
        'estacionamento/esp32/status',
        'semaforo/esp32/status'
    ]);
    io.emit('mqttStatus', true);
});

mqttClient.on('reconnect', () => {
    mqttConectado = false;
    io.emit('mqttStatus', false);
});

mqttClient.on('close', () => {
    mqttConectado = false;
    io.emit('mqttStatus', false);
});

mqttClient.on('error', (err) => {
    mqttConectado = false;
    io.emit('mqttStatus', false);
    console.log('❌ Erro ao conectar no Mosquitto:', err.message);
});

mqttClient.on('message', (topic, message) => {
    if (topic === 'estacionamento/esp32/status') {
        try {
            const data = JSON.parse(message.toString());
            console.log('📬 Dados recebidos do ESP32:', data);
            ultimaLeituraVagas = data;
            io.emit('atualizarVagas', data);
        } catch (e) {
            // Tratamento caso o ESP32 envie o número puro em vez de JSON stringificado
            const vagasPuro = parseInt(message.toString());
            if (!isNaN(vagasPuro)) {
                console.log('📬 Dados recebidos do ESP32 (Número Puro):', vagasPuro);
                ultimaLeituraVagas = { vagas: vagasPuro };
                io.emit('atualizarVagas', ultimaLeituraVagas);
            } else {
                console.error('❌ Formato de mensagem MQTT inválido:', e.message);
            }
        }
    } else if (topic === 'semaforo/esp32/status') {
        try {
            const data = JSON.parse(message.toString());
            if (!data || typeof data !== 'object' || Array.isArray(data)) {
                throw new Error('O status dos semáforos deve ser um objeto JSON.');
            }

            console.log('🚦 Status dos semáforos recebido:', data);
            ultimoStatusSemaforos = data;
            io.emit('atualizarSemaforos', data);
        } catch (e) {
            console.error('❌ Formato de status dos semáforos inválido:', e.message);
        }
    }
});

io.on('connection', (socket) => {
    console.log('📱 Um navegador abriu o Dashboard!');

    socket.emit('mqttStatus', mqttConectado);
    if (ultimaLeituraVagas) {
        socket.emit('atualizarVagas', ultimaLeituraVagas);
    }
    if (ultimoStatusSemaforos) {
        socket.emit('atualizarSemaforos', ultimoStatusSemaforos);
    }

    // Recebe a ação ('abrir' ou 'fechar') do botão do HTML e publica no MQTT para o ESP32
    socket.on('comando', (acao, responder) => {
        const responderSeguro = typeof responder === 'function' ? responder : () => {};
        if (!['abrir', 'fechar'].includes(acao)) {
            responderSeguro({ ok: false, mensagem: 'Comando inválido.' });
            return;
        }
        if (!mqttConectado || !mqttClient.connected) {
            responderSeguro({ ok: false, mensagem: 'Broker MQTT desconectado. Tente novamente.' });
            return;
        }

        console.log(`🤖 Comando enviado pela Web para o ESP32: ${acao}`);
        mqttClient.publish('estacionamento/esp32/comando', acao, { qos: 1 }, (err) => {
            if (err) {
                console.log('❌ Falha ao publicar comando MQTT:', err.message);
                responderSeguro({ ok: false, mensagem: 'Não foi possível enviar o comando ao broker.' });
                return;
            }

            responderSeguro({ ok: true, acao });
        });
    });
});

const port = process.env.PORT || 3000;

server.listen(port, () => {
    console.log(`🚀 Servidor rodando em http://localhost:${port}`);
});
