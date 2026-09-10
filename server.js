const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const core = require('./core');

const DIR = __dirname;
const PORTA = 3000;

const app = express();
app.use(express.json());
app.use(express.static(path.join(DIR, 'public')));

let sock = null;
let estado = { conexao: 'desconectado', ultimoErro: null, qrDataUrl: null };
let conectando = false;
let job = null;
let ultimoDiaAgendado = null;

function setEstado(parcial) {
  estado = { ...estado, ...parcial };
}

async function conectar() {
  if (estado.conexao === 'conectado') return sock;
  if (conectando) return null;
  conectando = true;
  setEstado({ conexao: 'conectando', qrDataUrl: null, ultimoErro: null });

  try {
    sock = await core.criarSocket(DIR);

    sock.ev.on('connection.update', async ({ connection, qr, lastDisconnect }) => {
      if (qr) {
        try {
          const dataUrl = await QRCode.toDataURL(qr, { width: 300, margin: 2 });
          setEstado({ qrDataUrl: dataUrl, conexao: 'qr' });
        } catch (_) {}
      }
      if (connection === 'open') {
        setEstado({ conexao: 'conectado', qrDataUrl: null });
        conectando = false;
        core.log('WhatsApp conectado!', DIR);
      }
      if (connection === 'close') {
        conectando = false;
        const codigo = lastDisconnect?.error?.output?.statusCode;
        sock = null;
        if (codigo === core.DisconnectReason.loggedOut) {
          setEstado({ conexao: 'desconectado', ultimoErro: 'Sessao deslogada. Apague a pasta "sessao-baileys" e reinicie.' });
          core.log('Sessao deslogada do WhatsApp.', DIR);
        } else {
          setEstado({ conexao: 'desconectado', ultimoErro: 'Conexao caiu (codigo ' + codigo + '). Reconectando em 10s...' });
          core.log('Conexao caiu (codigo ' + codigo + '). Reconectando...', DIR);
          setTimeout(() => conectar().catch(() => {}), 10000);
        }
      }
    });

    setTimeout(() => {
      if (estado.conexao !== 'conectado' && estado.conexao !== 'qr' && conectando) {
        conectando = false;
        setEstado({ conexao: 'desconectado', ultimoErro: 'Tempo esgotado ao conectar.' });
      }
    }, 180000);

    return sock;
  } catch (erro) {
    conectando = false;
    setEstado({ conexao: 'desconectado', ultimoErro: 'Erro ao conectar: ' + erro.message });
    return null;
  }
}

async function aguardarConectado(timeoutMs = 180000) {
  const fim = Date.now() + timeoutMs;
  while (Date.now() < fim) {
    if (estado.conexao === 'conectado' && sock) return sock;
    await core.sleep(1000);
  }
  throw new Error('tempo esgotado aguardando conexao do WhatsApp');
}

async function atualizarGrupos() {
  const s = await aguardarConectado();
  const grupos = await core.listarGrupos(s);
  core.salvarCacheGrupos(DIR, grupos);
  return grupos;
}

function arquivoSelecionado() {
  const config = core.carregarConfig(DIR);
  const caminho = core.selecionarArquivo(config);
  return caminho ? { caminho, nome: path.basename(caminho) } : null;
}

app.get('/api/estado', (req, res) => {
  const config = core.carregarConfig(DIR);
  const cache = core.lerCacheGrupos(DIR);
  res.json({
    ...estado,
    config,
    arquivo: arquivoSelecionado(),
    gruposCache: cache,
    job: job && job.ativo ? { ...job, erros: job.erros.slice(-10) } : job && !job.ativo ? job : null,
    log: core.lerLog(DIR, 80),
  });
});

app.post('/api/config', (req, res) => {
  const config = core.carregarConfig(DIR);
  const { pastaArquivos, mensagem, grupos, delayMinSegundos, delayMaxSegundos, pausarACadaXGrupos, pausaMinutos } = req.body || {};
  if (typeof pastaArquivos === 'string' && pastaArquivos.trim() !== '') config.pastaArquivos = pastaArquivos.trim();
  if (typeof mensagem === 'string') config.mensagens = mensagem.split('\n---\n').filter((m) => m.trim() !== '');
  if (Array.isArray(grupos)) config.grupos = grupos.map(String);
  if (Number.isFinite(delayMinSegundos)) config.delayMinSegundos = Math.max(1, delayMinSegundos);
  if (Number.isFinite(delayMaxSegundos)) config.delayMaxSegundos = Math.max(delayMinSegundos || 1, delayMaxSegundos);
  if (Number.isFinite(pausarACadaXGrupos)) config.pausarACadaXGrupos = Math.max(0, pausarACadaXGrupos);
  if (Number.isFinite(pausaMinutos)) config.pausaMinutos = Math.max(1, pausaMinutos);
  core.salvarConfig(DIR, config);
  res.json({ ok: true, config });
});

app.post('/api/atualizar-grupos', async (req, res) => {
  try {
    const grupos = await atualizarGrupos();
    res.json({ ok: true, total: grupos.length, grupos });
  } catch (erro) {
    res.status(500).json({ ok: false, erro: erro.message });
  }
});

app.post('/api/envio', async (req, res) => {
  if (job && job.ativo) {
    return res.status(409).json({ ok: false, erro: 'Ja existe um envio em andamento.' });
  }
  const modo = req.body?.modo === 'teste' ? 'teste' : 'real';
  const config = core.carregarConfig(DIR);
  const arquivo = arquivoSelecionado();
  if (!arquivo) {
    return res.status(400).json({ ok: false, erro: 'Nenhum arquivo Excel encontrado na pasta configurada.' });
  }
  if ((config.grupos || []).length === 0) {
    return res.status(400).json({ ok: false, erro: 'Nenhum grupo selecionado.' });
  }

  job = {
    ativo: true,
    modo,
    inicio: new Date().toISOString(),
    indice: 0,
    total: 0,
    ok: 0,
    falha: 0,
    atual: 'preparando...',
    status: 'preparando',
    resultado: null,
    erros: [],
    abort: false,
  };

  res.json({ ok: true, modo });

  try {
    const s = await aguardarConectado();
    if (modo === 'teste') {
      const gruposWa = await core.listarGrupos(s);
      const alvos = core.resolverAlvos(config, gruposWa);
      job.total = alvos.length;
      job.status = 'concluido';
      job.ativo = false;
      job.fim = new Date().toISOString();
      job.resultado = {
        modo,
        arquivo: arquivo.nome,
        mensagem: config.mensagens[0],
        alvos,
        mensagemNaoEnviada: true,
      };
      core.log(`[TESTE] Simulacao concluida: ${alvos.length} grupo(s), arquivo ${arquivo.nome}. Nenhum envio.`, DIR);
      return;
    }

    const gruposWa = await core.listarGrupos(s);
    const alvos = core.resolverAlvos(config, gruposWa);
    if (alvos.length === 0) {
      job.status = 'erro';
      job.ativo = false;
      job.fim = new Date().toISOString();
      job.resultado = { erro: 'Nenhum dos grupos configurados foi encontrado. Atualize a lista de grupos.' };
      core.log('Nenhum destinatario valido encontrado.', DIR);
      return;
    }
    job.total = alvos.length;
    const resumo = await core.enviarArquivo(DIR, s, config, alvos, arquivo.caminho, {
      onProgress: (p) => {
        job.indice = p.indice;
        job.total = p.total;
        job.atual = p.atual;
        if (p.status === 'ok') job.ok++;
        if (p.status === 'falha') {
          job.falha++;
          job.erros.push(`${p.atual}: ${p.erro || 'erro'}`);
        }
        job.status = p.status;
      },
      abortCheck: () => job.abort,
    });
    job.status = resumo.abortado ? 'interrompido' : 'concluido';
    job.ativo = false;
    job.fim = new Date().toISOString();
    job.resultado = { modo: 'real', ...resumo };
  } catch (erro) {
    job.status = 'erro';
    job.ativo = false;
    job.fim = new Date().toISOString();
    job.resultado = { erro: erro.message };
    core.log('ERRO no envio: ' + erro.message, DIR);
  }
});

app.post('/api/parar', (req, res) => {
  if (job && job.ativo) {
    job.abort = true;
    return res.json({ ok: true, msg: 'Interrompendo apos o envio atual...' });
  }
  res.json({ ok: false, msg: 'Nenhum envio em andamento.' });
});

app.get('/abrir-pasta', (req, res) => {
  const caminho = String(req.query.caminho || '');
  if (!caminho || !fs.existsSync(caminho)) {
    return res.status(400).send('Pasta nao encontrada: ' + caminho);
  }
  require('child_process').exec('explorer "' + caminho + '"');
  res.send('<script>window.close()</script>Pasta aberta.');
});

app.post('/api/qr-escaneado', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/agendamento', (req, res) => {
  const config = core.carregarConfig(DIR);
  const { ativo, horario } = req.body || {};
  if (typeof horario === 'string') {
    if (horario !== '' && !/^\d{1,2}:\d{2}$/.test(horario)) {
      return res.status(400).json({ ok: false, erro: 'Horario invalido. Use HH:MM (ex: 07:30).' });
    }
    config.horarioEnvio = horario === '' ? '' : ('0' + horario).slice(-5);
  }
  if (typeof ativo === 'boolean') {
    config.horarioEnvio = ativo ? (config.horarioEnvio || '07:30') : '';
  }
  core.salvarConfig(DIR, config);
  res.json({ ok: true, config });
});

app.get('/api/log', (req, res) => {
  res.json({ linhas: core.lerLog(DIR, 200) });
});

setInterval(() => {
  const config = core.carregarConfig(DIR);
  if (!config.horarioEnvio || !/^\d{1,2}:\d{2}$/.test(config.horarioEnvio)) return;
  if (job && job.ativo) return;
  const agora = new Date();
  const hhmm = String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0');
  const hoje = agora.toDateString();
  if (hhmm === config.horarioEnvio && ultimoDiaAgendado !== hoje) {
    ultimoDiaAgendado = hoje;
    core.log(`>>> Disparo agendado (${config.horarioEnvio}) iniciando...`, DIR);
    fetch(`http://localhost:${PORTA}/api/envio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modo: 'real' }),
    }).catch((e) => core.log('ERRO ao iniciar envio agendado: ' + e.message, DIR));
  }
}, 30000);

conectar().catch(() => {});

app.listen(PORTA, '127.0.0.1', () => {
  console.log(`\n=== DASHBOARD DISPONIVEL: http://localhost:${PORTA} ===\n`);
  console.log('(deixe esta janela aberta enquanto usa o disparador)\n');
});
