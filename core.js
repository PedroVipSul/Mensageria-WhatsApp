const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  Browsers,
  DisconnectReason,
} = require('@whiskeysockets/baileys');
const P = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MIMES = {
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  '.xls': 'application/vnd.ms-excel',
};

const CONFIG_PADRAO = {
  pastaArquivos: path.join(os.homedir(), 'Desktop', 'Disparos WhatsApp'),
  arquivo: '',
  grupos: [],
  mensagens: ['Bom dia! Boas vendas\nSegue estoque'],
  delayMinSegundos: 30,
  delayMaxSegundos: 90,
  pausarACadaXGrupos: 5,
  pausaMinutos: 10,
  horarioEnvio: '',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function caminhoConfig(dir) {
  return path.join(dir, 'config.json');
}

function caminhoLog(dir) {
  return path.join(dir, 'disparo.log');
}

function carregarConfig(dir) {
  let atual = {};
  try {
    atual = JSON.parse(fs.readFileSync(caminhoConfig(dir), 'utf-8'));
  } catch (_) {}
  return { ...CONFIG_PADRAO, ...atual };
}

function salvarConfig(dir, config) {
  fs.writeFileSync(caminhoConfig(dir), JSON.stringify(config, null, 2), 'utf-8');
}

function log(msg, dir = __dirname) {
  const linha = `[${new Date().toLocaleString('pt-BR')}] ${msg}`;
  fs.appendFileSync(caminhoLog(dir), linha + '\n');
}

function lerLog(dir, ultimas = 200) {
  try {
    const linhas = fs.readFileSync(caminhoLog(dir), 'utf-8').trim().split('\n');
    return linhas.slice(-ultimas);
  } catch (_) {
    return [];
  }
}

function delayAleatorio(config) {
  const min = (config.delayMinSegundos || 30) * 1000;
  const max = (config.delayMaxSegundos || 90) * 1000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function selecionarArquivo(config) {
  if (config.arquivo && config.arquivo.trim() !== '') return config.arquivo;
  const pasta = config.pastaArquivos;
  if (!pasta || !fs.existsSync(pasta)) return null;
  const arquivos = fs
    .readdirSync(pasta)
    .filter((f) => /\.(xlsx|xlsm|xls)$/i.test(f))
    .map((f) => {
      const caminho = path.join(pasta, f);
      return { caminho, mtime: fs.statSync(caminho).mtime.getTime() };
    })
    .sort((a, b) => b.mtime - a.mtime);
  return arquivos.length ? arquivos[0].caminho : null;
}

function pastaSessao(dir) {
  return path.join(dir, 'sessao-baileys');
}

async function criarSocket(dir, eventos) {
  const { state, saveCreds } = await useMultiFileAuthState(pastaSessao(dir));
  let version;
  try {
    ({ version } = await fetchLatestBaileysVersion());
  } catch (_) {}
  const sock = makeWASocket({
    version,
    auth: state,
    browser: Browsers.ubuntu('Chrome'),
    logger: P({ level: 'silent' }),
    syncFullHistory: false,
  });
  sock.ev.on('creds.update', saveCreds);
  return sock;
}

async function listarGrupos(sock) {
  const grupos = Object.values(await sock.groupFetchAllParticipating());
  return grupos
    .map((g) => ({ id: g.id, nome: g.subject || g.id }))
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
}

function caminhoCacheGrupos(dir) {
  return path.join(dir, 'grupos-cache.json');
}

function salvarCacheGrupos(dir, grupos) {
  fs.writeFileSync(
    caminhoCacheGrupos(dir),
    JSON.stringify({ atualizadoEm: new Date().toISOString(), grupos }, null, 2),
    'utf-8'
  );
}

function lerCacheGrupos(dir) {
  try {
    return JSON.parse(fs.readFileSync(caminhoCacheGrupos(dir), 'utf-8'));
  } catch (_) {
    return null;
  }
}

function resolverAlvos(config, grupos) {
  const alvos = [];
  const ids = new Set();
  for (const ref of config.grupos || []) {
    const r = String(ref).trim();
    if (!r) continue;
    const g =
      grupos.find((x) => x.id === r) ||
      grupos.find((x) => (x.nome || '').trim().toLowerCase() === r.toLowerCase());
    if (g && !ids.has(g.id)) {
      ids.add(g.id);
      alvos.push(g);
    }
  }
  return alvos;
}

async function enviarArquivo(dir, sock, config, alvos, caminhoArquivo, opcoes = {}) {
  const { onProgress = () => {}, abortCheck = () => false } = opcoes;
  const nomeArquivo = path.basename(caminhoArquivo);
  const mime = MIMES[path.extname(nomeArquivo).toLowerCase()] || 'application/octet-stream';
  const buffer = fs.readFileSync(caminhoArquivo);

  log(`Arquivo selecionado: ${nomeArquivo}`, dir);
  log(`Iniciando envio para ${alvos.length} grupo(s)...`, dir);

  let enviados = 0;
  let falhas = 0;
  let indice = 0;
  let abortado = false;
  const erros = [];

  for (const chat of alvos) {
    if (abortCheck()) {
      abortado = true;
      break;
    }
    indice++;
    onProgress({ indice, total: alvos.length, atual: chat.nome, status: 'enviando' });

    const texto = (config.mensagens[Math.floor(Math.random() * config.mensagens.length)] || '').trim();
    try {
      await sock.sendMessage(chat.id, {
        document: buffer,
        mimetype: mime,
        fileName: nomeArquivo,
        caption: texto,
      });
      enviados++;
      log(`[${indice}/${alvos.length}] OK -> ${chat.nome}`, dir);
      onProgress({ indice, total: alvos.length, atual: chat.nome, status: 'ok' });
    } catch (erro) {
      falhas++;
      erros.push(`${chat.nome}: ${erro.message}`);
      log(`[${indice}/${alvos.length}] FALHOU -> ${chat.nome}: ${erro.message}`, dir);
      onProgress({ indice, total: alvos.length, atual: chat.nome, status: 'falha', erro: erro.message });
    }

    if (indice < alvos.length && !abortCheck()) {
      const lote = config.pausarACadaXGrupos || 0;
      if (lote > 0 && indice % lote === 0) {
        const pausaMs = (config.pausaMinutos || 10) * 60 * 1000;
        log(`>>> Pausa de ${config.pausaMinutos} minutos (lote de ${lote} envios)...`, dir);
        onProgress({ indice, total: alvos.length, atual: 'PAUSA', status: 'pausa', pausaMinutos: config.pausaMinutos });
        const fimPausa = Date.now() + pausaMs;
        while (Date.now() < fimPausa && !abortCheck()) await sleep(1000);
        if (abortCheck()) abortado = true;
      } else {
        const espera = delayAleatorio(config);
        log(`(aguardando ${Math.round(espera / 1000)}s antes do proximo...)`, dir);
        const fimEspera = Date.now() + espera;
        while (Date.now() < fimEspera && !abortCheck()) await sleep(1000);
        if (abortCheck()) abortado = true;
      }
    }
  }

  const resumo = { enviados, falhas, total: alvos.length, abortado, erros };
  log(
    abortado
      ? `Envio interrompido pelo usuario: ${enviados}/${alvos.length} enviados.`
      : `Concluido: ${enviados}/${alvos.length} envios realizados.`,
    dir
  );
  return resumo;
}

module.exports = {
  DisconnectReason,
  MIMES,
  sleep,
  carregarConfig,
  salvarConfig,
  log,
  lerLog,
  delayAleatorio,
  selecionarArquivo,
  criarSocket,
  listarGrupos,
  salvarCacheGrupos,
  lerCacheGrupos,
  resolverAlvos,
  enviarArquivo,
};
