const core = require('./core');

const DIR = __dirname;
const MODO = process.argv[2] || '';

async function principal() {
  const sock = await core.criarSocket(DIR);

  const pronto = new Promise((resolve, reject) => {
    sock.ev.on('connection.update', ({ connection, qr, lastDisconnect }) => {
      if (connection === 'open') resolve();
      if (connection === 'close') {
        const codigo = lastDisconnect?.error?.output?.statusCode;
        reject(new Error('desconectado (codigo ' + codigo + ')'));
      }
    });
  });

  try {
    await Promise.race([
      pronto,
      core.sleep(180000).then(() => {
        throw new Error('tempo esgotado aguardando conexao (3 min)');
      }),
    ]);
    console.log('WhatsApp conectado!');
    core.log('WhatsApp conectado! (CLI)', DIR);

    if (MODO === '--listar') {
      console.log('=== SEUS GRUPOS (nome exato ou ID para o config.json) ===\n');
      const grupos = await core.listarGrupos(sock);
      for (const g of grupos) console.log(` - "${g.nome}"  (${g.id})`);
      console.log(`\nTotal: ${grupos.length} grupos`);
      await sock.end(new Error('fim'));
      return;
    }

    const config = core.carregarConfig(DIR);
    const caminhoArquivo = core.selecionarArquivo(config);
    if (!caminhoArquivo) {
      console.error(`ERRO: nenhum arquivo Excel encontrado. Pasta: ${config.pastaArquivos}`);
      console.error('Coloque o .xlsx do dia na pasta ou preencha "arquivo" no config.json');
      await sock.end(new Error('fim'));
      return;
    }

    const gruposWa = await core.listarGrupos(sock);
    const alvos = core.resolverAlvos(config, gruposWa);

    if (MODO === '--teste') {
      console.log('\n=== MODO TESTE — NENHUM ENVIO SERA FEITO ===');
      console.log('Arquivo que seria enviado: ' + caminhoArquivo);
      console.log('Mensagem: ' + (config.mensagens[0] || '').replace(/\n/g, ' | '));
      console.log('Grupos que receberiam o estoque:');
      for (const a of alvos) console.log(` - "${a.nome}"  (${a.id})`);
      console.log(`\nTotal: ${alvos.length} grupo(s). Nada foi enviado.`);
      core.log(`[TESTE] Simulacao concluida: ${alvos.length} grupo(s). Nenhum envio.`, DIR);
      await sock.end(new Error('fim'));
      return;
    }

    if (alvos.length === 0) {
      console.error('\nNenhum grupo valido no config.json. Rode "node enviar.js --listar" para ver os nomes.');
      await sock.end(new Error('fim'));
      return;
    }

    const resumo = await core.enviarArquivo(DIR, sock, config, alvos, caminhoArquivo, {
      onProgress: (p) => {
        if (p.status === 'pausa') console.log(`>>> Pausa de ${p.pausaMinutos} min...`);
      },
    });
    console.log(`\nResultado: ${resumo.enviados}/${resumo.total} enviados.`);
    await sock.end(new Error('fim'));
  } catch (erro) {
    console.error('Falha: ' + erro.message);
    if (erro.message.includes('loggedOut') || erro.message.includes('401')) {
      console.error('Sessao deslogada. Apague a pasta "sessao-baileys" e rode de novo para escanear o QR.');
    }
    process.exit(1);
  }
}

console.log('Iniciando... (se pedir QR, escaneie pelo celular)');
principal();
