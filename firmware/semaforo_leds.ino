#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>

const char* NOME_REDE_WIFI = "SUA_REDE_WIFI";
const char* SENHA_REDE_WIFI = "SUA_SENHA_WIFI";
const char* ENDERECO_BROKER_MQTT = "10.68.74.224";
const uint16_t PORTA_BROKER_MQTT = 1883;
const char* TOPICO_STATUS_SEMAFOROS = "semaforo/esp32/status";

WiFiClient transporteWifi;
PubSubClient clienteMqtt(transporteWifi);

enum class CorSemaforo : uint8_t {
    Desligado,
    Vermelho,
    Amarelo,
    Verde
};

struct PinosSemaforo {
    uint8_t vermelho;
    uint8_t amarelo;
    uint8_t verde;
};

const PinosSemaforo semaforoEntrada = {13, 12, 25};
const PinosSemaforo semaforoSaida = {35, 34, 23};

void definirSemaforo(const PinosSemaforo& pinos, CorSemaforo cor) {
    digitalWrite(pinos.vermelho, cor == CorSemaforo::Vermelho ? HIGH : LOW);
    digitalWrite(pinos.amarelo, cor == CorSemaforo::Amarelo ? HIGH : LOW);
    digitalWrite(pinos.verde, cor == CorSemaforo::Verde ? HIGH : LOW);
}

const char* nomeCor(CorSemaforo cor) {
    switch (cor) {
        case CorSemaforo::Vermelho: return "vermelho";
        case CorSemaforo::Amarelo: return "amarelo";
        case CorSemaforo::Verde: return "verde";
        default: return "apagado";
    }
}

CorSemaforo estadoEntrada = CorSemaforo::Desligado;
CorSemaforo estadoSaida = CorSemaforo::Desligado;

void publicarStatusSemaforos() {
    if (!clienteMqtt.connected()) return;

    char mensagem[80];
    snprintf(
        mensagem,
        sizeof(mensagem),
        "{\"entrada\":\"%s\",\"saida\":\"%s\"}",
        nomeCor(estadoEntrada),
        nomeCor(estadoSaida)
    );
    clienteMqtt.publish(TOPICO_STATUS_SEMAFOROS, mensagem, true);
}

void iniciarSemaforo(const PinosSemaforo& pinos) {
    pinMode(pinos.vermelho, OUTPUT);
    pinMode(pinos.amarelo, OUTPUT);
    pinMode(pinos.verde, OUTPUT);
    definirSemaforo(pinos, CorSemaforo::Desligado);
}

void definirEntrada(CorSemaforo cor) {
    definirSemaforo(semaforoEntrada, cor);
    estadoEntrada = cor;
    publicarStatusSemaforos();
}

void definirSaida(CorSemaforo cor) {
    definirSemaforo(semaforoSaida, cor);
    estadoSaida = cor;
    publicarStatusSemaforos();
}

void conectarWifi() {
    WiFi.mode(WIFI_STA);
    WiFi.begin(NOME_REDE_WIFI, SENHA_REDE_WIFI);
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
    }
}

void reconectarMqtt() {
    while (!clienteMqtt.connected()) {
        if (clienteMqtt.connect("semaforo-esp32")) {
            publicarStatusSemaforos();
        } else {
            delay(1000);
        }
    }
}

void setup() {
    iniciarSemaforo(semaforoEntrada);
    iniciarSemaforo(semaforoSaida);

    definirEntrada(CorSemaforo::Verde);
    definirSaida(CorSemaforo::Vermelho);

    conectarWifi();
    clienteMqtt.setServer(ENDERECO_BROKER_MQTT, PORTA_BROKER_MQTT);
    reconectarMqtt();
}

void loop() {
}
