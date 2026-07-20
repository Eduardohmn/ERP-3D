// --- UTILITÁRIOS ---
const fmtDinheiro = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtNum = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// --- ESTADO DO BANCO DE DADOS ---
let syncTimeLocal = Date.now(); 
let DB = {
    filamentos: [], extras: [], receitas: [],
    estoqueProntos: [], historicoProducao: [], historicoVendas: [], historicoPerdas: [],
    historicoGastos: [], energiaAcumulada: 0
};
let simulacaoAtual = null; let editandoReceitaId = null;

// --- INTEGRAÇÃO COM GITHUB ---
let GITHUB_TOKEN = localStorage.getItem('github_token');
let GIST_ID = localStorage.getItem('gist_id');

async function iniciarNuvem() {
    if (!GITHUB_TOKEN || !GIST_ID) {
        const inputDados = prompt("☁️ Cole as chaves (Token + ID Gist):");
        if (inputDados) {
            const tokenMatch = inputDados.match(/(ghp_[a-zA-Z0-9]+)/);
            if (tokenMatch) {
                GITHUB_TOKEN = tokenMatch[1]; GIST_ID = inputDados.replace(GITHUB_TOKEN, '').replace(/[^a-zA-Z0-9]/g, '').trim();
                localStorage.setItem('github_token', GITHUB_TOKEN); localStorage.setItem('gist_id', GIST_ID);
            } else { alert("Token inválido."); return; }
        } else { return; }
    }
    try {
        const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: { 'Authorization': `token ${GITHUB_TOKEN}` } });
        if (!response.ok) throw new Error("Credenciais inválidas.");
        const data = await response.json(); const content = data.files['database.json'].content;
        if (content && content !== "{}") {
            const cloudDB = JSON.parse(content);
            DB.filamentos = cloudDB.filamentos || []; DB.extras = cloudDB.extras || []; DB.receitas = cloudDB.receitas || [];
            DB.estoqueProntos = cloudDB.estoqueProntos || []; DB.historicoProducao = cloudDB.historicoProducao || [];
            DB.historicoVendas = cloudDB.historicoVendas || []; DB.historicoPerdas = cloudDB.historicoPerdas || []; 
            DB.historicoGastos = cloudDB.historicoGastos || [];
            DB.energiaAcumulada = cloudDB.energiaAcumulada !== undefined ? cloudDB.energiaAcumulada : (DB.energiaAcumulada || 0);
            syncTimeLocal = Date.now();
        }
    } catch (error) { console.error("Erro nuvem:", error); }
}

async function salvarDB() {
    if (!GITHUB_TOKEN || !GIST_ID) { localStorage.setItem('db_backup', JSON.stringify(DB)); return; }
    try {
        const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, { headers: { 'Authorization': `token ${GITHUB_TOKEN}` } });
        const data = await res.json(); const cloudDB = JSON.parse(data.files['database.json'].content);

        const mergeInteligente = (localArr, cloudArr) => {
            let result = [];
            const localMap = new Map(localArr.map(i => [i.id, i])); const cloudMap = new Map(cloudArr.map(i => [i.id, i]));
            for (let [id, localItem] of localMap) {
                const cloudItem = cloudMap.get(id);
                if (cloudItem) {
                    const tLocal = localItem.lastModified || localItem.id; const tCloud = cloudItem.lastModified || cloudItem.id;
                    result.push(tLocal >= tCloud ? localItem : cloudItem);
                } else { result.push(localItem); }
            }
            for (let [id, cloudItem] of cloudMap) {
                if (!localMap.has(id)) {
                    const itemTime = cloudItem.lastModified || cloudItem.id;
                    if (itemTime >= syncTimeLocal) result.push(cloudItem);
                }
            }
            return result;
        };

        DB.filamentos = mergeInteligente(DB.filamentos, cloudDB.filamentos || []); DB.extras = mergeInteligente(DB.extras, cloudDB.extras || []);
        DB.receitas = mergeInteligente(DB.receitas, cloudDB.receitas || []); DB.estoqueProntos = mergeInteligente(DB.estoqueProntos, cloudDB.estoqueProntos || []);
        DB.historicoVendas = mergeInteligente(DB.historicoVendas, cloudDB.historicoVendas || []); DB.historicoProducao = mergeInteligente(DB.historicoProducao, cloudDB.historicoProducao || []);
        DB.historicoPerdas = mergeInteligente(DB.historicoPerdas, cloudDB.historicoPerdas || []); DB.historicoGastos = mergeInteligente(DB.historicoGastos, cloudDB.historicoGastos || []);

        syncTimeLocal = Date.now(); localStorage.setItem('db_backup', JSON.stringify(DB));

        await fetch(`https://api.github.com/gists/${GIST_ID}`, {
            method: 'PATCH', headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ files: { 'database.json': { content: JSON.stringify(DB) } } })
        });
        
        atualizarSelectsDinamicos(); atualizarSelectProducao(); renderizarInventario(); renderizarCatalogo(); renderizarAbaVendas(); renderizarHistoricos();
    } catch (e) { console.error("Falha sync:", e); }
}

async function iniciarApp() {
    const backup = localStorage.getItem('db_backup'); if (backup) Object.assign(DB, JSON.parse(backup));
    await iniciarNuvem(); atualizarSelectsDinamicos(); atualizarSelectProducao(); renderizarInventario(); renderizarCatalogo(); renderizarAbaVendas(); renderizarHistoricos();
}

// --- NAVEGAÇÃO ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active')); document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        const tabId = e.target.getAttribute('data-tab'); document.getElementById(tabId).classList.add('active'); e.target.classList.add('active');
    });
});

// --- LÓGICA DE CONSUMO DAS IMPRESSORAS ---
function atualizarKWMaquina(prefix) {
    const imp = document.getElementById(`${prefix}-impressora`).value;
    const mat = document.getElementById(`${prefix}-material`).value;
    const elKw = document.getElementById(`${prefix}-kw`);
    if(!elKw) return;
    
    // Dados oficiais da Bambu Lab
    if (imp === 'A1') { elKw.value = mat === 'PLA' ? 0.095 : 0.200; } 
    else if (imp === 'P1S') { elKw.value = mat === 'PLA' ? 0.105 : 0.140; }
}

['calc', 'desc'].forEach(prefix => {
    const impEl = document.getElementById(`${prefix}-impressora`);
    const matEl = document.getElementById(`${prefix}-material`);
    if(impEl) impEl.addEventListener('change', () => atualizarKWMaquina(prefix));
    if(matEl) matEl.addEventListener('change', () => atualizarKWMaquina(prefix));
});

// --- INVENTÁRIO ---
document.getElementById('form-filamento').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('fil-nome').value;
    const local = document.getElementById('fil-local').value || "Não definido";
    const peso = parseFloat(document.getElementById('fil-peso').value);
    const preco = parseFloat(document.getElementById('fil-preco').value);
    const novoId = Date.now();
    DB.filamentos.push({ id: novoId, lastModified: Date.now(), nome, localizacao: local, pesoInicial: peso, pesoRestante: peso, precoTotal: preco, custoPorGrama: preco / peso });
    DB.historicoGastos.push({ id: Date.now(), lastModified: Date.now(), data: new Date().toLocaleDateString('pt-BR'), descricao: `Compra: Rolo ${nome} [Lote #${novoId.toString().slice(-4)}]`, valor: preco });
    await salvarDB(); document.getElementById('form-filamento').reset(); renderizarInventario(); atualizarSelectsDinamicos();
});

document.getElementById('form-extra').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('ext-nome').value;
    const medida = document.getElementById('ext-medida').value;
    const qtd = parseFloat(document.getElementById('ext-qtd').value);
    const preco = parseFloat(document.getElementById('ext-preco').value);
    DB.extras.push({ id: Date.now(), lastModified: Date.now(), nome, medida, qtdInicial: qtd, qtdRestante: qtd, precoTotal: preco, custoUnitario: preco / qtd });
    DB.historicoGastos.push({ id: Date.now(), lastModified: Date.now(), data: new Date().toLocaleDateString('pt-BR'), descricao: `Compra: Insumo ${nome}`, valor: preco });
    await salvarDB(); document.getElementById('form-extra').reset(); renderizarInventario(); atualizarSelectsDinamicos();
});

function renderizarInventario() {
    const elFil = document.getElementById('lista-filamentos');
    if(!elFil) return; elFil.innerHTML = '';
    DB.filamentos.forEach(f => {
        const perc = (f.pesoRestante / f.pesoInicial) * 100;
        let cor = perc <= 15 ? 'stock-low' : (perc <= 50 ? 'stock-warn' : 'stock-good');
        const shortId = f.id.toString().slice(-4);
        elFil.innerHTML += `<div class="item-card"><div class="item-title"><span style="color:var(--primary)">[#${shortId}]</span> ${f.nome} <div><button class="btn-small" onclick="editarFil(${f.id})" title="Editar Peso/Local">✏️</button><button class="btn-danger btn-small" onclick="apagarFil(${f.id})">X</button></div></div><div class="item-details"><span>📍 Local: <strong>${f.localizacao || 'Prateleira'}</strong></span><span>Custo: ${fmtDinheiro(f.custoPorGrama)}/g</span><span style="font-weight:bold;">Resta: ${fmtNum(f.pesoRestante)}g</span></div><div class="stock-bar-bg"><div class="stock-bar-fill ${cor}" style="width: ${perc}%"></div></div></div>`;
    });
    const elExt = document.getElementById('lista-extras');
    elExt.innerHTML = '';
    DB.extras.forEach(x => {
        const perc = (x.qtdRestante / x.qtdInicial) * 100;
        let cor = perc <= 15 ? 'stock-low' : (perc <= 50 ? 'stock-warn' : 'stock-good');
        const sigla = x.medida === 'Unidades' ? 'un' : x.medida;
        elExt.innerHTML += `<div class="item-card"><div class="item-title">${x.nome} <div><button class="btn-small" onclick="editarExt(${x.id})">✏️</button><button class="btn-danger btn-small" onclick="apagarExt(${x.id})">X</button></div></div><div class="item-details"><span>Custo: ${fmtDinheiro(x.custoUnitario)}/un</span><span style="font-weight:bold;">Resta: ${fmtNum(x.qtdRestante)}</span></div><div class="stock-bar-bg"><div class="stock-bar-fill ${cor}" style="width: ${perc}%"></div></div></div>`;
    });
}

async function editarFil(id) {
    const fil = DB.filamentos.find(f => f.id === id); if(!fil) return;
    const novoPeso = prompt(`[1/2] Ajuste o peso atual (g) de ${fil.nome}:`, fil.pesoRestante);
    if (novoPeso !== null) {
        fil.pesoRestante = parseFloat(novoPeso.replace(',', '.'));
        const novoLocal = prompt(`[2/2] Onde este rolo está agora?`, fil.localizacao || "Prateleira");
        if(novoLocal !== null) fil.localizacao = novoLocal;
        fil.lastModified = Date.now();
        if (fil.pesoRestante > fil.pesoInicial) { fil.pesoInicial = fil.pesoRestante; fil.custoPorGrama = fil.precoTotal / fil.pesoInicial; }
        await salvarDB(); renderizarInventario(); atualizarSelectsDinamicos();
    }
}
async function editarExt(id) {
    const ext = DB.extras.find(e => e.id === id); if(!ext) return;
    const novaQtd = prompt(`Ajuste a qtd de ${ext.nome}:`, ext.qtdRestante);
    if (novaQtd !== null) { ext.qtdRestante = parseFloat(novaQtd.replace(',', '.')); ext.lastModified = Date.now(); if (ext.qtdRestante > ext.qtdInicial) { ext.qtdInicial = ext.qtdRestante; ext.custoUnitario = ext.precoTotal / ext.qtdInicial; } await salvarDB(); renderizarInventario(); atualizarSelectsDinamicos(); }
}
async function apagarFil(id) { if(confirm("Apagar filamento?")) { DB.filamentos = DB.filamentos.filter(f => f.id !== id); await salvarDB(); renderizarInventario(); atualizarSelectsDinamicos(); } }
async function apagarExt(id) { if(confirm("Apagar insumo?")) { DB.extras = DB.extras.filter(x => x.id !== id); await salvarDB(); renderizarInventario(); atualizarSelectsDinamicos(); } }

// --- SELECTS DINÂMICOS ---
function formatarOpcaoFilamento(f) {
    return `[${f.localizacao || '?'}] ${f.nome} (Disp: ${fmtNum(f.pesoRestante)}g) - #${f.id.toString().slice(-4)}`;
}

function atualizarSelectsDinamicos() {
    for(let i=1; i<=4; i++) {
        const selectFil = document.getElementById(`calc-filamento-${i}`);
        if(selectFil) {
            const valorAtual = selectFil.value;
            selectFil.innerHTML = i === 1 ? '<option value="">Selecione no Inventário...</option>' : '<option value="">Nenhum...</option>';
            DB.filamentos.forEach(f => { const opt = document.createElement('option'); opt.value = f.id; opt.textContent = formatarOpcaoFilamento(f); selectFil.appendChild(opt); });
            selectFil.value = valorAtual;
        }
    }

    const selectTipoDesc = document.getElementById('desc-tipo');
    
    if(selectTipoDesc) {
        const tipo = selectTipoDesc.value;
        const fsFilamentos = document.getElementById('desc-filamentos-fieldset');
        const fsInsumos = document.getElementById('desc-insumo-fieldset');
        const camposEnergia = document.querySelectorAll('.desc-energia-group');
        
        if(tipo === 'Insumo') {
            if(fsFilamentos) fsFilamentos.style.display = 'none';
            if(fsInsumos) fsInsumos.style.display = 'block';
            camposEnergia.forEach(el => el.style.display = 'none');
            document.getElementById('desc-filamento-1').required = false; document.getElementById('desc-peso-1').required = false;
            document.getElementById('desc-insumo').required = true; document.getElementById('desc-insumo-qtd').required = true;

            const selIns = document.getElementById('desc-insumo');
            if(selIns) {
                const valIns = selIns.value; selIns.innerHTML = '<option value="">Selecione no Inventário...</option>';
                DB.extras.forEach(x => { const opt = document.createElement('option'); opt.value = x.id; opt.textContent = `${x.nome} (Disp: ${fmtNum(x.qtdRestante)})`; selIns.appendChild(opt); });
                selIns.value = valIns;
            }
        } else {
            if(fsFilamentos) fsFilamentos.style.display = 'block';
            if(fsInsumos) fsInsumos.style.display = 'none';
            camposEnergia.forEach(el => el.style.display = 'flex');
            document.getElementById('desc-filamento-1').required = true; document.getElementById('desc-peso-1').required = true;
            document.getElementById('desc-insumo').required = false; document.getElementById('desc-insumo-qtd').required = false;

            for(let i=1; i<=4; i++) {
                const selF = document.getElementById(`desc-filamento-${i}`);
                if(selF) {
                    const valF = selF.value;
                    selF.innerHTML = i === 1 ? '<option value="">Selecione...</option>' : '<option value="">Nenhum...</option>';
                    DB.filamentos.forEach(f => { const opt = document.createElement('option'); opt.value = f.id; opt.textContent = formatarOpcaoFilamento(f); selF.appendChild(opt); });
                    selF.value = valF;
                }
            }
        }
    }

    const listaExt = document.getElementById('calc-lista-extras');
    if(listaExt) {
        listaExt.innerHTML = '';
        DB.extras.forEach(x => {
            const sigla = x.medida === 'Unidades' ? 'un' : x.medida;
            listaExt.innerHTML += `<div class="flex-between" style="background: var(--bg-input); padding: 0.5rem; border-radius: 4px; border: 1px solid var(--border);"><div><strong>${x.nome}</strong> <span style="font-size: 0.8rem; color: var(--text-muted)">(${fmtDinheiro(x.custoUnitario)}/${sigla})</span></div><div><input type="number" class="calc-ext-uso" data-id="${x.id}" min="0" step="0.01" placeholder="0" style="width: 80px; padding: 0.4rem;"><span>${sigla}</span></div></div>`;
        });
    }
}
const elDescTipo = document.getElementById('desc-tipo'); if(elDescTipo) elDescTipo.addEventListener('change', atualizarSelectsDinamicos);

// --- SIMULAÇÃO ---
document.getElementById('form-calc').addEventListener('submit', (e) => {
    e.preventDefault();
    const impressoraUsada = document.getElementById('calc-impressora').value;
    const nomeProduto = document.getElementById('calc-nome').value + ` (${impressoraUsada})`;
    const rende = parseInt(document.getElementById('calc-rende').value) || 1;
    
    let custoFil = 0; let filamentosUsados = [];
    for(let i=1; i<=4; i++) {
        const filId = parseInt(document.getElementById(`calc-filamento-${i}`).value);
        const peso = parseFloat(document.getElementById(`calc-peso-${i}`).value) || 0;
        if(filId && peso > 0) {
            const fil = DB.filamentos.find(f => f.id === filId);
            if(!fil) continue;
            custoFil += peso * fil.custoPorGrama;
            filamentosUsados.push({ id: filId, nome: fil.nome, peso: peso, custoRef: fil.custoPorGrama });
        }
    }
    if(filamentosUsados.length === 0) { alert("Selecione um filamento principal."); return; }

    const h = parseFloat(document.getElementById('calc-horas').value) || 0;
    const m = parseFloat(document.getElementById('calc-minutos').value) || 0;
    const kw = parseFloat(document.getElementById('calc-kw').value);
    const precoKwh = parseFloat(document.getElementById('calc-preco-kwh').value);
    const custoEne = (h + (m/60)) * kw * precoKwh;
    const custoMan = (custoFil + custoEne) * 0.01;
    
    let custoExt = 0; let extrasUsados = [];
    document.querySelectorAll('.calc-ext-uso').forEach(input => {
        const qtd = parseFloat(input.value) || 0;
        if(qtd > 0) {
            const extId = parseInt(input.getAttribute('data-id'));
            const extra = DB.extras.find(ex => ex.id === extId);
            if(extra) { custoExt += (qtd * extra.custoUnitario); extrasUsados.push({ id: extId, nome: extra.nome, qtd: qtd, custoRef: extra.custoUnitario }); }
        }
    });

    const custoTotalFornada = custoFil + custoEne + custoMan + custoExt;
    const custoUnitario = custoTotalFornada / rende; 
    
    const m3 = custoUnitario * 3; const m5 = custoUnitario * 5;
    const shopeeM3 = (m3 + 4) / 0.8; const shopeeM5 = (m5 + 4) / 0.8;

    document.getElementById('res-custo-fil').textContent = fmtDinheiro(custoFil);
    document.getElementById('res-custo-ener').textContent = fmtDinheiro(custoEne + custoMan);
    document.getElementById('res-custo-ext').textContent = fmtDinheiro(custoExt);
    document.getElementById('res-custo-total').textContent = fmtDinheiro(custoUnitario) + " (por un.)";
    
    document.getElementById('res-m3').textContent = fmtDinheiro(m3); document.getElementById('lucro-m3').textContent = `Lucro Líquido: ${fmtDinheiro(m3 - custoUnitario)}`;
    document.getElementById('res-m5').textContent = fmtDinheiro(m5); document.getElementById('lucro-m5').textContent = `Lucro Líquido: ${fmtDinheiro(m5 - custoUnitario)}`;
    document.getElementById('res-shopee-m3').textContent = fmtDinheiro(shopeeM3); document.getElementById('res-shopee-m5').textContent = fmtDinheiro(shopeeM5);
    document.getElementById('sim-shopee-preco').value = shopeeM5.toFixed(2);
    
    simulacaoAtual = { 
        id: editandoReceitaId || Date.now(), lastModified: Date.now(),
        nome: nomeProduto, impressora: impressoraUsada, custoUnitario, custoTotalFornada, rende, filamentosUsados, extrasUsados, params: { h, m, kw, precoKwh }
    };
    atualizarSimulacaoShopee(shopeeM5, custoUnitario);
    document.getElementById('painel-resultados').style.display = 'block';
});

document.getElementById('sim-shopee-preco').addEventListener('input', (e) => { if(simulacaoAtual) atualizarSimulacaoShopee(parseFloat(e.target.value), simulacaoAtual.custoUnitario); });

function atualizarSimulacaoShopee(precoVenda, custo) {
    const elTaxa = document.getElementById('sim-shopee-taxa'); const elLiq = document.getElementById('sim-shopee-liquido'); const elLuc = document.getElementById('sim-shopee-lucro'); const alertBox = document.getElementById('alerta-shopee');
    if(isNaN(precoVenda) || precoVenda <= 0) { elTaxa.textContent='R$ 0,00'; elLiq.textContent='R$ 0,00'; elLuc.textContent='R$ 0,00'; alertBox.style.display='none'; return; }
    const taxa = 4 + (precoVenda * 0.20); const liquido = precoVenda - taxa; const lucro = liquido - custo;
    elTaxa.textContent = fmtDinheiro(taxa); elLiq.textContent = fmtDinheiro(liquido); elLuc.textContent = fmtDinheiro(lucro); elLuc.className = lucro >= 0 ? 'text-success' : 'text-danger';
    if(lucro < 0) { alertBox.className = 'alert-box alert-danger'; alertBox.innerHTML = '🚨 PREJUÍZO! Venda não cobre taxas e custo.'; alertBox.style.display = 'block'; } 
    else if(lucro < 1) { alertBox.className = 'alert-box alert-warning'; alertBox.innerHTML = '⚠️ SEM LUCRO! Preço de custo.'; alertBox.style.display = 'block'; } 
    else { alertBox.style.display = 'none'; }
}

document.getElementById('btn-salvar-receita').addEventListener('click', async () => {
    if(!simulacaoAtual) return;
    if (editandoReceitaId) { const index = DB.receitas.findIndex(r => r.id === editandoReceitaId); if (index !== -1) DB.receitas[index] = simulacaoAtual; alert(`Atualizada com sucesso!`); } 
    else { DB.receitas.push(simulacaoAtual); alert(`Salva no Catálogo!`); }
    await salvarDB(); resetarSimulacao(); atualizarSelectProducao(); renderizarCatalogo();
});

document.getElementById('btn-cancelar-edicao').addEventListener('click', () => { resetarSimulacao(); });

function resetarSimulacao() {
    document.getElementById('painel-resultados').style.display = 'none'; document.getElementById('form-calc').reset();
    document.getElementById('btn-salvar-receita').innerHTML = "💾 Salvar Receita no Catálogo"; document.getElementById('btn-cancelar-edicao').style.display = 'none';
    simulacaoAtual = null; editandoReceitaId = null; atualizarKWMaquina('calc');
}

function renderizarCatalogo() {
    const el = document.getElementById('lista-catalogo'); if(!el) return; el.innerHTML = '';
    if(DB.receitas.length === 0) { el.innerHTML = '<p class="ajuda">Nenhuma receita salva.</p>'; return; }
    DB.receitas.forEach(r => {
        let fillTxt = r.filamentosUsados.map(f => `${fmtNum(f.peso)}g de ${f.nome}`).join(', ');
        let extTxt = r.extrasUsados && r.extrasUsados.length ? r.extrasUsados.map(ex => `${fmtNum(ex.qtd)}x ${ex.nome}`).join(', ') : 'Nenhum';
        el.innerHTML += `<div class="item-card" style="border-left: 4px solid var(--primary);"><div class="item-title">${r.nome}<div style="display:flex; gap:0.3rem;"><button class="btn-small" style="background-color: var(--warning); color: #000; border: none; border-radius: 4px; cursor: pointer;" onclick="editarReceita(${r.id})">✏️</button><button class="btn-danger btn-small" style="border: none; border-radius: 4px; cursor: pointer;" onclick="apagarReceita(${r.id})">X</button></div></div><div class="item-details"><span style="color: var(--primary); font-weight: bold;">Custo Unitário Base: ${fmtDinheiro(r.custoUnitario)}</span><span style="font-size: 0.8rem; margin-top: 0.3rem;"><strong>Rende:</strong> ${r.rende || 1} un. por fornada</span><span style="font-size: 0.8rem;"><strong>Filamentos:</strong> ${fillTxt}</span><span style="font-size: 0.8rem;"><strong>Insumos:</strong> ${extTxt}</span></div></div>`;
    });
}

function editarReceita(id) {
    const r = DB.receitas.find(x => x.id === id); if(!r) return;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active')); document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-calc').classList.add('active'); document.querySelector('[data-tab="tab-calc"]').classList.add('active');
    
    // Remove o sufixo (A1) ou (P1S) para não duplicar na edição
    document.getElementById('calc-nome').value = r.nome.replace(/\s\((A1|P1S)\)$/, ''); 
    if(r.impressora) document.getElementById('calc-impressora').value = r.impressora;
    
    const elRende = document.getElementById('calc-rende'); if(elRende) elRende.value = r.rende || 1;
    for(let i=1; i<=4; i++) { document.getElementById(`calc-filamento-${i}`).value = ""; document.getElementById(`calc-peso-${i}`).value = ""; }
    r.filamentosUsados.forEach((fUsado, index) => { if(index < 4) { const i = index + 1; document.getElementById(`calc-filamento-${i}`).value = fUsado.id; document.getElementById(`calc-peso-${i}`).value = fUsado.peso; } });
    if(r.params) { document.getElementById('calc-horas').value = r.params.h || 0; document.getElementById('calc-minutos').value = r.params.m || 0; document.getElementById('calc-kw').value = r.params.kw || 0.095; document.getElementById('calc-preco-kwh').value = r.params.precoKwh || 0.95; }
    document.querySelectorAll('.calc-ext-uso').forEach(input => input.value = "");
    if(r.extrasUsados) { r.extrasUsados.forEach(eUsado => { const input = document.querySelector(`.calc-ext-uso[data-id="${eUsado.id}"]`); if(input) input.value = eUsado.qtd; }); }
    
    editandoReceitaId = r.id; document.getElementById('btn-salvar-receita').innerHTML = "💾 Atualizar Receita"; document.getElementById('btn-cancelar-edicao').style.display = 'block';
    document.getElementById('form-calc').dispatchEvent(new Event('submit'));
}

async function apagarReceita(id) { if(confirm("Excluir esta receita?")) { DB.receitas = DB.receitas.filter(r => r.id !== id); await salvarDB(); renderizarCatalogo(); atualizarSelectProducao(); } }

// --- FÁBRICA E DESCARTES ---
function atualizarSelectProducao() {
    const sel = document.getElementById('prod-receita'); if(!sel) return; sel.innerHTML = '<option value="">Selecione um produto salvo...</option>';
    DB.receitas.forEach(r => { const opt = document.createElement('option'); opt.value = r.id; opt.textContent = `${r.nome} (Custo Un.: ${fmtDinheiro(r.custoUnitario)})`; sel.appendChild(opt); });
}

document.getElementById('form-producao').addEventListener('submit', async (e) => {
    e.preventDefault();
    const receitaId = parseInt(document.getElementById('prod-receita').value);
    const receita = DB.receitas.find(r => r.id === receitaId); if(!receita) return;

    const qtdTotalProduzida = parseInt(document.getElementById('prod-qtd').value);
    const qtdPerdida = parseInt(prompt(`Das ${qtdTotalProduzida} unidades, quantas deram erro/descarte?`, "0")) || 0;
    if (qtdPerdida > qtdTotalProduzida) { alert("Perda maior que o total!"); return; }
    const qtdSucesso = qtdTotalProduzida - qtdPerdida;

    let descontarInsumosDaPerda = false;
    if(qtdPerdida > 0 && receita.extrasUsados && receita.extrasUsados.length > 0) {
        descontarInsumosDaPerda = confirm(`Você perdeu ${qtdPerdida} peças.\nOs insumos (correntes, argolas) também foram pro lixo?\n\n[OK] Sim, desconte do estoque.\n[Cancelar] Não, sobraram.`);
    }

    const rendePadrao = receita.rende || 1;
    const fatorGastoFilamento = qtdTotalProduzida / rendePadrao;
    const fatorGastoInsumo = descontarInsumosDaPerda ? (qtdTotalProduzida / rendePadrao) : (qtdSucesso / rendePadrao);

    let energiaFornada = 0;
    if(receita.params) energiaFornada = (receita.params.h + (receita.params.m / 60)) * receita.params.kw * receita.params.precoKwh;
    const energiaTotalProducao = energiaFornada * fatorGastoFilamento;
    DB.energiaAcumulada = (DB.energiaAcumulada || 0) + energiaTotalProducao;

    for(let fUsado of receita.filamentosUsados) {
        const fil = DB.filamentos.find(f => f.id === fUsado.id);
        if(!fil || fil.pesoRestante < (fUsado.peso * fatorGastoFilamento)) { alert(`Falta o filamento: ${fil ? fil.nome : 'Desconhecido'}`); return; }
    }
    if(receita.extrasUsados) {
        for(let eUsado of receita.extrasUsados) {
            const ext = DB.extras.find(ex => ex.id === eUsado.id);
            if(!ext || ext.qtdRestante < (eUsado.qtd * fatorGastoInsumo)) { alert(`Falta o insumo: ${ext ? ext.nome : 'Desconhecido'}`); return; }
        }
    }

    receita.filamentosUsados.forEach(fUsado => { const fil = DB.filamentos.find(f => f.id === fUsado.id); fil.pesoRestante -= (fUsado.peso * fatorGastoFilamento); fil.lastModified = Date.now(); });
    if(receita.extrasUsados) { receita.extrasUsados.forEach(eUsado => { const ext = DB.extras.find(ex => ex.id === eUsado.id); if(ext) { ext.qtdRestante -= (eUsado.qtd * fatorGastoInsumo); ext.lastModified = Date.now(); } }); }

    if(qtdSucesso > 0) {
        let itemEstoque = DB.estoqueProntos.find(p => p.receitaId === receita.id);
        if(itemEstoque) {
            const valorEstoqueAntigo = itemEstoque.quantidade * itemEstoque.custoUnitario;
            const valorNovoLote = qtdSucesso * receita.custoUnitario;
            itemEstoque.quantidade += qtdSucesso; itemEstoque.custoUnitario = (valorEstoqueAntigo + valorNovoLote) / itemEstoque.quantidade; itemEstoque.lastModified = Date.now();
        } else {
            DB.estoqueProntos.push({ id: Date.now(), lastModified: Date.now(), receitaId: receita.id, nome: receita.nome, custoUnitario: receita.custoUnitario, quantidade: qtdSucesso });
        }
    }

    let custoPerda = 0; let custoGastoImediato = 0; 
    if (qtdPerdida > 0) {
        let custoInsumosUnitario = 0;
        if (receita.extrasUsados) custoInsumosUnitario = receita.extrasUsados.reduce((acc, ex) => acc + (ex.qtd * ex.custoRef), 0) / rendePadrao;
        custoPerda = descontarInsumosDaPerda ? (receita.custoUnitario * qtdPerdida) : Math.max(0, (receita.custoUnitario - custoInsumosUnitario) * qtdPerdida);
        const energiaUnitario = energiaFornada / rendePadrao;
        custoGastoImediato = Math.max(0, custoPerda - (energiaUnitario * qtdPerdida)); 

        DB.historicoPerdas.push({ id: Date.now(), lastModified: Date.now(), data: new Date().toLocaleDateString('pt-BR'), tipo: "Descarte de Produção", filamentoNome: receita.nome, pesoGasto: qtdPerdida, tempoGasto: "N/A", custoTotal: custoPerda, motivo: descontarInsumosDaPerda ? "Falha no lote (insumos perdidos)" : "Falha no lote (insumos salvos)" });
        DB.historicoGastos.push({ id: Date.now(), lastModified: Date.now(), data: new Date().toLocaleDateString('pt-BR'), descricao: `Perda (Produção): ${receita.nome}`, valor: custoGastoImediato });
    }

    DB.historicoProducao.push({ id: Date.now(), lastModified: Date.now(), data: new Date().toLocaleDateString('pt-BR'), nomeProduto: receita.nome, quantidade: qtdSucesso, custoTotalFornada: (receita.custoUnitario * qtdSucesso) + custoPerda });
    await salvarDB(); alert(`Resumo:\nSucesso: ${qtdSucesso}\nDescarte: ${qtdPerdida}`); document.getElementById('form-producao').reset(); renderizarHistoricos();
});

document.getElementById('form-descarte').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tipo = document.getElementById('desc-tipo').value;
    let motivo = document.getElementById('desc-motivo').value || 'Não informado';
    let materialNome = ""; let custoTotalPerda = 0; let pesoTotalGasto = 0; let custoGastoImediato = 0;

    if(tipo === 'Insumo') {
        const materialId = parseInt(document.getElementById('desc-insumo').value);
        const quantidade = parseFloat(document.getElementById('desc-insumo-qtd').value);
        const ext = DB.extras.find(ex => ex.id === materialId);
        if(!ext || quantidade > ext.qtdRestante) { alert("Estoque insuficiente."); return; }
        
        custoTotalPerda = quantidade * ext.custoUnitario; custoGastoImediato = custoTotalPerda; 
        materialNome = ext.nome; pesoTotalGasto = quantidade;
        ext.qtdRestante -= quantidade; ext.lastModified = Date.now();
    } else {
        let custoMateriais = 0; let filamentosUsados = []; let detalhesNomes = [];
        for(let i=1; i<=4; i++) {
            const idSel = parseInt(document.getElementById(`desc-filamento-${i}`).value);
            const peso = parseFloat(document.getElementById(`desc-peso-${i}`).value) || 0;
            if(idSel && peso > 0) {
                const fil = DB.filamentos.find(f => f.id === idSel);
                if(!fil || peso > fil.pesoRestante) { alert(`Estoque insuficiente de ${fil ? fil.nome : 'filamento'}.`); return; }
                custoMateriais += (peso * fil.custoPorGrama); pesoTotalGasto += peso;
                detalhesNomes.push(`${peso}g de ${fil.nome}`); filamentosUsados.push({ fil, peso });
            }
        }
        if(filamentosUsados.length === 0) { alert("Selecione pelo menos um filamento."); return; }

        const horas = parseFloat(document.getElementById('desc-horas').value) || 0;
        const min = parseFloat(document.getElementById('desc-min').value) || 0;
        const kw = parseFloat(document.getElementById('desc-kw').value) || 0.095;
        const kwh = parseFloat(document.getElementById('desc-preco-kwh').value) || 0.95;

        const impressora = document.getElementById('desc-impressora').value;
        const custoEletrico = ((horas + (min / 60)) * kw * kwh);
        DB.energiaAcumulada = (DB.energiaAcumulada || 0) + custoEletrico; 

        custoTotalPerda = custoMateriais + custoEletrico; custoGastoImediato = custoMateriais; 
        materialNome = detalhesNomes.join(' + ') + ` [${impressora}]`;
        motivo += ` (Tempo: ${horas}h ${min}m)`;
        filamentosUsados.forEach(uso => { uso.fil.pesoRestante -= uso.peso; uso.fil.lastModified = Date.now(); });
    }

    DB.historicoPerdas.push({ id: Date.now(), lastModified: Date.now(), data: new Date().toLocaleDateString('pt-BR'), tipo, filamentoNome: materialNome, pesoGasto: pesoTotalGasto, tempoGasto: "N/A", custoTotal: custoTotalPerda, motivo });
    DB.historicoGastos.push({ id: Date.now(), lastModified: Date.now(), data: new Date().toLocaleDateString('pt-BR'), descricao: `Perda (${tipo}): ${materialNome}`, valor: custoGastoImediato });
    
    await salvarDB(); alert(`Perda registrada.`); document.getElementById('form-descarte').reset(); atualizarSelectsDinamicos(); renderizarHistoricos(); atualizarKWMaquina('desc');
});

// --- VENDAS E DASHBOARD ---
function renderizarAbaVendas() {
    const elLista = document.getElementById('lista-estoque-prontos'); elLista.innerHTML = '';
    DB.estoqueProntos.forEach(p => { elLista.innerHTML += `<div class="item-card" style="border-left: 4px solid var(--primary);"><div class="item-title">${p.nome}</div><div class="item-details"><span style="font-weight:bold;">Estoque: ${p.quantidade} un.</span><span>Custo Médio Fab.: ${fmtDinheiro(p.custoUnitario)}</span></div></div>`; });

    const selectVenda = document.getElementById('venda-produto'); selectVenda.innerHTML = '<option value="">Selecione no estoque pronto...</option>';
    DB.estoqueProntos.forEach(p => { if(p.quantidade > 0) { const opt = document.createElement('option'); opt.value = p.id; opt.textContent = `${p.nome} (Disp: ${p.quantidade})`; selectVenda.appendChild(opt); } });
}

const calcularPrevVenda = () => {
    const prodId = parseInt(document.getElementById('venda-produto').value);
    const qtd = parseInt(document.getElementById('venda-qtd').value) || 0;
    const canal = document.getElementById('venda-canal').value;
    const precoUni = parseFloat(document.getElementById('venda-preco').value) || 0;

    const elCusto = document.getElementById('prev-custo'); const elTaxa = document.getElementById('prev-taxa'); const elLucro = document.getElementById('prev-lucro');
    const elSugestaoBox = document.getElementById('sugestao-preco-container'); const elSugestaoVal = document.getElementById('sugestao-preco-valor');

    if(!prodId) { elCusto.textContent = "R$ 0,00"; elTaxa.textContent = "R$ 0,00"; elLucro.textContent = "R$ 0,00"; if(elSugestaoBox) elSugestaoBox.style.display = 'none'; return; }
    
    const produto = DB.estoqueProntos.find(p => p.id === prodId); if(!produto) return;

    if(elSugestaoBox && elSugestaoVal) {
        let precoSugerido = 0;
        if (canal === 'Varejo') precoSugerido = produto.custoUnitario * 5; 
        else if (canal === 'Atacado') precoSugerido = produto.custoUnitario * 3; 
        else if (canal === 'Shopee') precoSugerido = ((produto.custoUnitario * 5) + 4) / 0.8;

        elSugestaoVal.textContent = fmtDinheiro(precoSugerido); elSugestaoBox.style.display = 'block';
        elSugestaoVal.onclick = () => { document.getElementById('venda-preco').value = precoSugerido.toFixed(2); calcularPrevVenda(); };
    }

    if(qtd <= 0 || precoUni <= 0) { elCusto.textContent = "R$ 0,00"; elTaxa.textContent = "R$ 0,00"; elLucro.textContent = "R$ 0,00"; return; }

    const custoTotalFornada = produto.custoUnitario * qtd; const receitaBruta = precoUni * qtd;
    const taxaTotal = canal === 'Shopee' ? ((precoUni * 0.20) + 4) * qtd : 0;
    const lucroLiquido = receitaBruta - custoTotalFornada - taxaTotal;

    elCusto.textContent = fmtDinheiro(custoTotalFornada); elTaxa.textContent = fmtDinheiro(taxaTotal); elLucro.textContent = fmtDinheiro(lucroLiquido);
    elLucro.className = lucroLiquido >= 0 ? 'text-success' : 'text-danger';
};
document.getElementById('venda-produto').addEventListener('change', calcularPrevVenda); document.getElementById('venda-qtd').addEventListener('input', calcularPrevVenda); document.getElementById('venda-canal').addEventListener('change', calcularPrevVenda); document.getElementById('venda-preco').addEventListener('input', calcularPrevVenda);

document.getElementById('form-venda').addEventListener('submit', async (e) => {
    e.preventDefault();
    const prodId = parseInt(document.getElementById('venda-produto').value); const qtd = parseInt(document.getElementById('venda-qtd').value);
    const canal = document.getElementById('venda-canal').value; const precoUni = parseFloat(document.getElementById('venda-preco').value);

    const produto = DB.estoqueProntos.find(p => p.id === prodId); if(qtd > produto.quantidade) { alert("Estoque insuficiente!"); return; }

    const custoTotalFab = produto.custoUnitario * qtd; const taxa = canal === 'Shopee' ? ((precoUni * 0.20) + 4) * qtd : 0; const lucro = (precoUni * qtd) - custoTotalFab - taxa;
    produto.quantidade -= qtd; produto.lastModified = Date.now();
    if(produto.quantidade === 0) { DB.estoqueProntos = DB.estoqueProntos.filter(p => p.id !== prodId); }

    DB.historicoVendas.push({ id: Date.now(), lastModified: Date.now(), data: new Date().toLocaleDateString('pt-BR'), nomeProduto: produto.nome, quantidade: qtd, canal, precoVendaTotal: (precoUni * qtd), taxa, lucroLiquido: lucro });
    await salvarDB(); alert(`Venda registrada.`); document.getElementById('form-venda').reset(); calcularPrevVenda(); renderizarAbaVendas(); renderizarHistoricos();
});

function renderizarHistoricos() {
    const totalEntrouBruto = DB.historicoVendas.reduce((acc, v) => acc + v.precoVendaTotal, 0); const totalTaxas = DB.historicoVendas.reduce((acc, v) => acc + (v.taxa || 0), 0);
    const totalEntrou = totalEntrouBruto - totalTaxas; const totalSaiu = DB.historicoGastos ? DB.historicoGastos.reduce((acc, g) => acc + g.valor, 0) : 0;
    const lucroLiquido = totalEntrou - totalSaiu;

    document.getElementById('dash-entrou').textContent = fmtDinheiro(totalEntrou); document.getElementById('dash-saiu').textContent = fmtDinheiro(totalSaiu);
    document.getElementById('dash-energia').textContent = fmtDinheiro(DB.energiaAcumulada || 0);
    const elLucro = document.getElementById('dash-lucro'); elLucro.textContent = fmtDinheiro(lucroLiquido); elLucro.className = lucroLiquido >= 0 ? 'text-success' : 'text-danger';

    const elVendas = document.getElementById('lista-historico-vendas'); elVendas.innerHTML = '';
    [...DB.historicoVendas].reverse().forEach(v => { elVendas.innerHTML += `<div class="card card-alt" style="margin-bottom: 0; border-left: 4px solid var(--success);"><div class="flex-between"><strong>${v.quantidade}x ${v.nomeProduto}</strong><span class="badge">${v.data}</span></div><div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.5rem;">Canal: ${v.canal} | Recebido: ${fmtDinheiro(v.precoVendaTotal)}</div><div class="res-row destaque" style="border:none; padding:0; margin-top:0.3rem;"><span>Lucro Real da Venda:</span><strong class="text-success">${fmtDinheiro(v.lucroLiquido)}</strong></div></div>`; });

    const elProducao = document.getElementById('lista-historico-producao'); elProducao.innerHTML = '';
    [...DB.historicoProducao].reverse().forEach(p => { elProducao.innerHTML += `<div class="card card-alt" style="margin-bottom: 0; border-left: 4px solid var(--primary);"><div class="flex-between"><strong>${p.quantidade}x ${p.nomeProduto} fabricados</strong><span class="badge">${p.data}</span></div></div>`; });

    const elPerdas = document.getElementById('lista-historico-perdas'); elPerdas.innerHTML = '';
    [...DB.historicoPerdas].reverse().forEach(p => { elPerdas.innerHTML += `<div class="card card-alt" style="margin-bottom: 0; border-left: 4px solid var(--warning);"><div class="flex-between"><strong>${p.tipo}: ${p.pesoGasto} em ${p.filamentoNome}</strong><span class="badge">${p.data}</span></div><div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.3rem;">Motivo: ${p.motivo}</div><div class="res-row destaque" style="border:none; padding:0;"><span style="color:var(--text-muted);">Prejuízo Total:</span><strong class="text-danger">-${fmtDinheiro(p.custoTotal)}</strong></div></div>`; });
}

document.getElementById('btn-pagar-energia').addEventListener('click', async () => {
    if(!DB.energiaAcumulada || DB.energiaAcumulada <= 0) { alert("A conta de luz já está zerada no sistema!"); return; }
    if(confirm(`Registrar o pagamento de ${fmtDinheiro(DB.energiaAcumulada)} referente à energia?\nIsso enviará o valor para o 'Total Saiu'.`)) {
        DB.historicoGastos.push({ id: Date.now(), lastModified: Date.now(), data: new Date().toLocaleDateString('pt-BR'), descricao: `⚡ Pagamento Energia (Impr. 3D)`, valor: DB.energiaAcumulada });
        DB.energiaAcumulada = 0; await salvarDB(); renderizarHistoricos(); alert("Pagamento registrado!");
    }
});

document.addEventListener('DOMContentLoaded', iniciarApp);