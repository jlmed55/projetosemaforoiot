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

const mqttClient = mqtt.connect('mqtt://127.0.0.1:1883');

mqttClient.on('connect', () => {
    console.log('✅ Node.js se conectou com sucesso ao Mosquitto local!');
    mqttClient.subscribe('estacionamento/esp32/status');
});

mqttClient.on('error', (err) => {
    console.log('❌ Erro ao conectar no Mosquitto:', err.message);
});

mqttClient.on('message', (topic, message) => {
    if (topic === 'estacionamento/esp32/status') {
        try {
            const data = JSON.parse(message.toString());
            console.log('📬 Dados recebidos do ESP32:', data);
            io.emit('atualizarVagas', data);
        } catch (e) {
            // Tratamento caso o ESP32 envie o número puro em vez de JSON stringificado
            const vagasPuro = parseInt(message.toString());
            if (!isNaN(vagasPuro)) {
                console.log('📬 Dados recebidos do ESP32 (Número Puro):', vagasPuro);
                io.emit('atualizarVagas', { vagas: vagasPuro });
            } else {
                console.error('❌ Formato de mensagem MQTT inválido:', e.message);
            }
        }
    }
});

io.on('connection', (socket) => {
    console.log('📱 Um navegador abriu o Dashboard!');
    
    // Recebe a ação ('abrir' ou 'fechar') do botão do HTML e publica no MQTT para o ESP32
    socket.on('comando', (acao) => {
        console.log(`🤖 Comando enviado pela Web para o ESP32: ${acao}`);
        mqttClient.publish('estacionamento/esp32/comando', acao);
    });
});

server.listen(3000, () => {
    console.log('🚀 Servidor rodando em http://localhost:3000');
});
