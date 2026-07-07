// --- UTILITÁRIOS ---
const fmtDinheiro = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtNum = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// --- ESTADO DO BANCO DE DADOS ---
let DB = {
    filamentos: [], extras: [], receitas: [],
    estoqueProntos: [], historicoProducao: [], historicoVendas: [], historicoPerdas: [],
    historicoGastos: []
};
let simulacaoAtual = null;
let editandoReceitaId = null;

// --- INTEGRAÇÃO COM GITHUB GISTS ---
let GITHUB_TOKEN = localStorage.getItem('github_token');
let GIST_ID = localStorage.getItem('gist_id');

async function iniciarNuvem() {
    if (!GITHUB_TOKEN || !GIST_ID) {
        const inputDados = prompt("☁️ Bem-vindo ao ERP em Nuvem!\n\nCole aqui as chaves (Token + ID Gist):");
        if (inputDados) {
            const tokenMatch = inputDados.match(/(ghp_[a-zA-Z0-9]+)/);
            if (tokenMatch) {
                GITHUB_TOKEN = tokenMatch[1];
                GIST_ID = inputDados.replace(GITHUB_TOKEN, '').replace(/[^a-zA-Z0-9]/g, '').trim();
                localStorage.setItem('github_token', GITHUB_TOKEN);
                localStorage.setItem('gist_id', GIST_ID);
            } else { alert("⚠️ Token inválido. Iniciando offline."); }
        }
    }

    try {
        const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: { 'Authorization': `token ${GITHUB_TOKEN}` } });
        if (!response.ok) throw new Error("Falha na conexão.");
        const data = await response.json();
        const cloudDB = JSON.parse(data.files['database.json'].content);
        
        DB.filamentos = cloudDB.filamentos || [];
        DB.extras = cloudDB.extras || [];
        DB.receitas = cloudDB.receitas || [];
        DB.estoqueProntos = cloudDB.estoqueProntos || [];
        DB.historicoProducao = cloudDB.historicoProducao || [];
        DB.historicoVendas = cloudDB.historicoVendas || [];
        DB.historicoPerdas = cloudDB.historicoPerdas || []; 
        DB.historicoGastos = cloudDB.historicoGastos || [];
        iniciarApp();
    } catch (e) { iniciarApp(); }
}

async function salvarDB() {
    localStorage.setItem('db_backup', JSON.stringify(DB));
    if (GITHUB_TOKEN && GIST_ID) {
        try {
            await fetch(`https://api.github.com/gists/${GIST_ID}`, {
                method: 'PATCH',
                headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ files: { 'database.json': { content: JSON.stringify(DB) } } })
            });
        } catch (e) { console.error("Erro ao salvar:", e); }
    }
}

// --- NAVEGAÇÃO ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        const tabId = e.target.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
        e.target.classList.add('active');
        if(tabId === 'tab-calc') atualizarSelectsDinamicos();
        if(tabId === 'tab-catalogo') renderizarCatalogo();
        if(tabId === 'tab-fabrica') { atualizarSelectsDinamicos(); atualizarSelectProducao(); }
        if(tabId === 'tab-inv') renderizarInventario();
        if(tabId === 'tab-vendas') renderizarAbaVendas();
        if(tabId === 'tab-hist') renderizarHistoricos();
    });
});

// --- INVENTÁRIO & GASTOS ---
document.getElementById('form-filamento').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('fil-nome').value;
    const peso = parseFloat(document.getElementById('fil-peso').value);
    const preco = parseFloat(document.getElementById('fil-preco').value);
    DB.filamentos.push({ id: Date.now(), nome, pesoInicial: peso, pesoRestante: peso, precoTotal: preco, custoPorGrama: preco / peso });
    DB.historicoGastos.push({ id: Date.now(), data: new Date().toLocaleDateString('pt-BR'), descricao: `Compra: Rolo ${nome}`, valor: preco });
    await salvarDB(); document.getElementById('form-filamento').reset(); renderizarInventario();
});

document.getElementById('form-extra').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('ext-nome').value;
    const qtd = parseFloat(document.getElementById('ext-qtd').value);
    const preco = parseFloat(document.getElementById('ext-preco').value);
    DB.extras.push({ id: Date.now(), nome, medida: document.getElementById('ext-medida').value, qtdInicial: qtd, qtdRestante: qtd, precoTotal: preco, custoUnitario: preco / qtd });
    DB.historicoGastos.push({ id: Date.now(), data: new Date().toLocaleDateString('pt-BR'), descricao: `Compra: Insumo ${nome}`, valor: preco });
    await salvarDB(); document.getElementById('form-extra').reset(); renderizarInventario();
});

function renderizarInventario() {
    const elFil = document.getElementById('lista-filamentos');
    elFil.innerHTML = '';
    DB.filamentos.forEach(f => {
        elFil.innerHTML += `<div class="item-card"><div class="item-title">${f.nome} <button class="btn-small" onclick="editarFil(${f.id})">✏️</button><button class="btn-danger btn-small" onclick="apagarFil(${f.id})">X</button></div><div class="item-details"><span>Custo: ${fmtDinheiro(f.custoPorGrama)}/g</span><span>Resta: ${fmtNum(f.pesoRestante)}g</span></div></div>`;
    });
    const elExt = document.getElementById('lista-extras');
    elExt.innerHTML = '';
    DB.extras.forEach(x => {
        elExt.innerHTML += `<div class="item-card"><div class="item-title">${x.nome} <button class="btn-small" onclick="editarExt(${x.id})">✏️</button><button class="btn-danger btn-small" onclick="apagarExt(${x.id})">X</button></div><div class="item-details"><span>Resta: ${fmtNum(x.qtdRestante)}</span></div></div>`;
    });
}

// --- LÓGICA DE PRODUÇÃO E VENDAS ---
document.getElementById('form-producao').addEventListener('submit', async (e) => {
    e.preventDefault();
    const receitaId = parseInt(document.getElementById('prod-receita').value);
    const qtdTotal = parseInt(document.getElementById('prod-qtd').value);
    const qtdPerdida = parseInt(prompt("Quantas peças foram descartadas?", "0")) || 0;
    const qtdSucesso = qtdTotal - qtdPerdida;
    
    if (qtdPerdida > qtdTotal) { alert("Perda maior que total!"); return; }
    const receita = DB.receitas.find(r => r.id === receitaId);
    
    // Baixa Material
    receita.filamentosUsados.forEach(f => DB.filamentos.find(x => x.id === f.id).pesoRestante -= (f.peso * qtdTotal));
    if(receita.extrasUsados) receita.extrasUsados.forEach(e => DB.extras.find(x => x.id === e.id).qtdRestante -= (e.qtd * qtdTotal));

    // Salva Estoque
    let itemEstoque = DB.estoqueProntos.find(p => p.receitaId === receita.id);
    if(itemEstoque) {
        const custoTotalAntigo = itemEstoque.quantidade * itemEstoque.custoUnitario;
        const custoTotalNovoLote = qtdSucesso * receita.custoTotal;
        itemEstoque.quantidade += qtdSucesso;
        itemEstoque.custoUnitario = (custoTotalAntigo + custoTotalNovoLote) / itemEstoque.quantidade;
    } else {
        DB.estoqueProntos.push({ id: Date.now(), receitaId: receita.id, nome: receita.nome, custoUnitario: receita.custoTotal, quantidade: qtdSucesso });
    }
    
    if(qtdPerdida > 0) {
        const custoPerda = receita.custoTotal * qtdPerdida;
        DB.historicoPerdas.push({ id: Date.now(), data: new Date().toLocaleDateString('pt-BR'), tipo: "Descarte Produção", filamentoNome: receita.nome, pesoGasto: qtdPerdida, custoTotal: custoPerda, motivo: "Falha Lote" });
        DB.historicoGastos.push({ id: Date.now(), data: new Date().toLocaleDateString('pt-BR'), descricao: `Perda: ${receita.nome}`, valor: custoPerda });
    }
    
    DB.historicoProducao.push({ id: Date.now(), data: new Date().toLocaleDateString('pt-BR'), nomeProduto: receita.nome, quantidade: qtdSucesso, custoTotalFornada: receita.custoTotal * qtdTotal });
    await salvarDB();
    alert("Produção registrada!");
    document.getElementById('form-producao').reset();
});

document.getElementById('form-venda').addEventListener('submit', async (e) => {
    e.preventDefault();
    const prodId = parseInt(document.getElementById('venda-produto').value);
    const qtd = parseInt(document.getElementById('venda-qtd').value);
    const canal = document.getElementById('venda-canal').value;
    const precoUni = parseFloat(document.getElementById('venda-preco').value);
    
    const produto = DB.estoqueProntos.find(p => p.id === prodId);
    const custoTotalFab = produto.custoUnitario * qtd;
    const taxa = canal === 'Shopee' ? ((precoUni * 0.20) + 4) * qtd : 0;
    
    produto.quantidade -= qtd;
    if(produto.quantidade === 0) DB.estoqueProntos = DB.estoqueProntos.filter(p => p.id !== prodId);
    
    DB.historicoVendas.push({ id: Date.now(), data: new Date().toLocaleDateString('pt-BR'), nomeProduto: produto.nome, quantidade: qtd, canal, precoVendaTotal: (precoUni * qtd), taxa, lucroLiquido: (precoUni * qtd) - custoTotalFab - taxa });
    await salvarDB();
    alert("Venda registrada!");
    document.getElementById('form-venda').reset();
    renderizarAbaVendas();
});

// --- DASHBOARD E HISTÓRICO ---
function renderizarHistoricos() {
    const totalEntrouBruto = DB.historicoVendas.reduce((acc, v) => acc + v.precoVendaTotal, 0);
    const totalTaxas = DB.historicoVendas.reduce((acc, v) => acc + (v.taxa || 0), 0);
    const totalEntrouLiquido = totalEntrouBruto - totalTaxas;
    const totalSaiu = DB.historicoGastos.reduce((acc, g) => acc + g.valor, 0);
    
    document.getElementById('dash-entrou').textContent = fmtDinheiro(totalEntrouLiquido);
    document.getElementById('dash-saiu').textContent = fmtDinheiro(totalSaiu);
    const elLucro = document.getElementById('dash-lucro');
    elLucro.textContent = fmtDinheiro(totalEntrouLiquido - totalSaiu);
    elLucro.className = (totalEntrouLiquido - totalSaiu) >= 0 ? 'text-success' : 'text-danger';
    
    // (Renderização das listas permanece a mesma da versão anterior...)
}

function iniciarApp() { atualizarSelectsDinamicos(); }
document.addEventListener('DOMContentLoaded', iniciarNuvem);