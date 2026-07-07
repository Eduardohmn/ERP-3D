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
        const inputDados = prompt(
            "☁️ Bem-vindo ao ERP em Nuvem!\n\n" +
            "Cole aqui as DUAS CHAVES juntas (pode ter espaço ou estar tudo colado).\n\n" +
            "Exemplo: ghp_SuaChave123 SeuGistID456"
        );
        
        if (inputDados) {
            const tokenMatch = inputDados.match(/(ghp_[a-zA-Z0-9]+)/);
            if (tokenMatch) {
                GITHUB_TOKEN = tokenMatch[1];
                GIST_ID = inputDados.replace(GITHUB_TOKEN, '').replace(/[^a-zA-Z0-9]/g, '').trim();
                
                if (GIST_ID.length > 0) {
                    localStorage.setItem('github_token', GITHUB_TOKEN);
                    localStorage.setItem('gist_id', GIST_ID);
                } else {
                    alert("⚠️ ID do Gist não encontrado. Iniciando offline.");
                    iniciarApp(); return;
                }
            } else {
                alert("⚠️ Token 'ghp_' inválido. Iniciando offline.");
                iniciarApp(); return;
            }
        } else {
            iniciarApp(); return;
        }
    }

    try {
        document.title = "Sincronizando...";
        const response = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
            headers: { 'Authorization': `token ${GITHUB_TOKEN}` }
        });
        if (!response.ok) throw new Error("Credenciais inválidas.");
        const data = await response.json();
        const content = data.files['database.json'].content;
        
        if (content && content !== "{}") {
            const cloudDB = JSON.parse(content);
            DB.filamentos = cloudDB.filamentos || [];
            DB.extras = cloudDB.extras || [];
            DB.receitas = cloudDB.receitas || [];
            DB.estoqueProntos = cloudDB.estoqueProntos || [];
            DB.historicoProducao = cloudDB.historicoProducao || [];
            DB.historicoVendas = cloudDB.historicoVendas || [];
            DB.historicoPerdas = cloudDB.historicoPerdas || []; 
            DB.historicoGastos = cloudDB.historicoGastos || [];
        }
        document.title = "Gestão 3D Pro - ERP";
        iniciarApp(); 
    } catch (error) {
        alert("Erro no GitHub: " + error.message);
        document.title = "Gestão 3D (Offline)";
        iniciarApp();
    }
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
        } catch (e) {
            console.error("Falha nuvem:", e);
        }
    }
}

// --- NAVEGAÇÃO DE ABAS ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        
        const tabId = e.target.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
        e.target.classList.add('active');
        
        if(tabId === 'tab-calc') { atualizarSelectsDinamicos(); }
        if(tabId === 'tab-catalogo') { renderizarCatalogo(); }
        if(tabId === 'tab-fabrica') { atualizarSelectsDinamicos(); atualizarSelectProducao(); }
        if(tabId === 'tab-inv') renderizarInventario();
        if(tabId === 'tab-vendas') renderizarAbaVendas();
        if(tabId === 'tab-hist') renderizarHistoricos();
    });
});

// ==========================================
// ABA 4: INVENTÁRIO INSUMOS
// ==========================================
document.getElementById('form-filamento').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('fil-nome').value;
    const peso = parseFloat(document.getElementById('fil-peso').value);
    const preco = parseFloat(document.getElementById('fil-preco').value);
    
    // Cadastra material no inventário
    DB.filamentos.push({ id: Date.now(), nome, pesoInicial: peso, pesoRestante: peso, precoTotal: preco, custoPorGrama: preco / peso });
    
    // Lança automaticamente o custo de aquisição nos Gastos do ERP
    DB.historicoGastos.push({ id: Date.now(), data: new Date().toLocaleDateString('pt-BR'), descricao: `Compra: Rolo ${nome}`, valor: preco });
    
    await salvarDB(); document.getElementById('form-filamento').reset(); renderizarInventario();
});

document.getElementById('form-extra').addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('ext-nome').value;
    const medida = document.getElementById('ext-medida').value;
    const qtd = parseFloat(document.getElementById('ext-qtd').value);
    const preco = parseFloat(document.getElementById('ext-preco').value);
    
    // Cadastra acessório no inventário
    DB.extras.push({ id: Date.now(), nome, medida, qtdInicial: qtd, qtdRestante: qtd, precoTotal: preco, custoUnitario: preco / qtd });
    
    // Lança automaticamente o custo de aquisição nos Gastos do ERP
    DB.historicoGastos.push({ id: Date.now(), data: new Date().toLocaleDateString('pt-BR'), descricao: `Compra: Insumo ${nome}`, valor: preco });
    
    await salvarDB(); document.getElementById('form-extra').reset(); renderizarInventario();
});

function renderizarInventario() {
    const elFil = document.getElementById('lista-filamentos');
    elFil.innerHTML = '';
    DB.filamentos.forEach(f => {
        const perc = (f.pesoRestante / f.pesoInicial) * 100;
        let cor = perc <= 15 ? 'stock-low' : (perc <= 50 ? 'stock-warn' : 'stock-good');
        elFil.innerHTML += `
            <div class="item-card">
                <div class="item-title">
                    ${f.nome} 
                    <div style="display:flex; gap:0.3rem;">
                        <button type="button" class="btn-small" style="background-color: var(--warning); color: #000; border: none; border-radius: 4px; cursor: pointer;" onclick="editarFil(${f.id})">✏️</button>
                        <button type="button" class="btn-danger btn-small" style="border: none; border-radius: 4px; cursor: pointer;" onclick="apagarFil(${f.id})">X</button>
                    </div>
                </div>
                <div class="item-details">
                    <span>Custo: ${fmtDinheiro(f.custoPorGrama)} / g</span>
                    <span style="font-weight: bold;">Resta: ${fmtNum(f.pesoRestante)}g</span>
                </div>
                <div class="stock-bar-bg"><div class="stock-bar-fill ${cor}" style="width: ${perc}%"></div></div>
            </div>`;
    });

    const elExt = document.getElementById('lista-extras');
    elExt.innerHTML = '';
    DB.extras.forEach(x => {
        const perc = (x.qtdRestante / x.qtdInicial) * 100;
        let cor = perc <= 15 ? 'stock-low' : (perc <= 50 ? 'stock-warn' : 'stock-good');
        const sigla = x.medida === 'Unidades' ? 'un' : x.medida;
        elExt.innerHTML += `
            <div class="item-card">
                <div class="item-title">
                    ${x.nome} 
                    <div style="display:flex; gap:0.3rem;">
                        <button type="button" class="btn-small" style="background-color: var(--warning); color: #000; border: none; border-radius: 4px; cursor: pointer;" onclick="editarExt(${x.id})">✏️</button>
                        <button type="button" class="btn-danger btn-small" style="border: none; border-radius: 4px; cursor: pointer;" onclick="apagarExt(${x.id})">X</button>
                    </div>
                </div>
                <div class="item-details">
                    <span>Custo: ${fmtDinheiro(x.custoUnitario)} / ${sigla}</span>
                    <span style="font-weight: bold;">Resta: ${fmtNum(x.qtdRestante)} ${sigla}</span>
                </div>
                <div class="stock-bar-bg"><div class="stock-bar-fill ${cor}" style="width: ${perc}%"></div></div>
            </div>`;
    });
}

async function editarFil(id) {
    const fil = DB.filamentos.find(f => f.id === id);
    if(!fil) return;
    const novoPeso = prompt(`Ajuste o peso atual (g) para o filamento ${fil.nome}:`, fil.pesoRestante);
    if (novoPeso !== null && novoPeso.trim() !== "") {
        const pesoNumerico = parseFloat(novoPeso.replace(',', '.'));
        if (!isNaN(pesoNumerico) && pesoNumerico >= 0) {
            fil.pesoRestante = pesoNumerico;
            if (fil.pesoRestante > fil.pesoInicial) { fil.pesoInicial = fil.pesoRestante; fil.custoPorGrama = fil.precoTotal / fil.pesoInicial; }
            await salvarDB(); renderizarInventario();
        }
    }
}

async function editarExt(id) {
    const ext = DB.extras.find(e => e.id === id);
    if(!ext) return;
    const sigla = ext.medida === 'Unidades' ? 'un' : ext.medida;
    const novaQtd = prompt(`Ajuste a quantidade atual (${sigla}) para o insumo ${ext.nome}:`, ext.qtdRestante);
    if (novaQtd !== null && novaQtd.trim() !== "") {
        const qtdNumerica = parseFloat(novaQtd.replace(',', '.'));
        if (!isNaN(qtdNumerica) && qtdNumerica >= 0) {
            ext.qtdRestante = qtdNumerica;
            if (ext.qtdRestante > ext.qtdInicial) { ext.qtdInicial = ext.qtdRestante; ext.custoUnitario = ext.precoTotal / ext.qtdInicial; }
            await salvarDB(); renderizarInventario();
        }
    }
}
async function apagarFil(id) { if(confirm("Apagar filamento?")) { DB.filamentos = DB.filamentos.filter(f => f.id !== id); await salvarDB(); renderizarInventario(); } }
async function apagarExt(id) { if(confirm("Apagar insumo?")) { DB.extras = DB.extras.filter(x => x.id !== id); await salvarDB(); renderizarInventario(); } }

// ==========================================
// CONFIGURAÇÃO DE COMPONENTES DINÂMICOS
// ==========================================
function atualizarSelectsDinamicos() {
    for(let i=1; i<=4; i++) {
        const selectFil = document.getElementById(`calc-filamento-${i}`);
        if(selectFil) {
            const valorAtual = selectFil.value;
            selectFil.innerHTML = i === 1 ? '<option value="">Selecione no Inventário...</option>' : '<option value="">Nenhum...</option>';
            DB.filamentos.forEach(f => {
                const opt = document.createElement('option'); opt.value = f.id; opt.textContent = `${f.nome}`; selectFil.appendChild(opt);
            });
            selectFil.value = valorAtual;
        }
    }

    const selectDesc = document.getElementById('desc-filamento');
    if(selectDesc) {
        const valorDescAtual = selectDesc.value;
        selectDesc.innerHTML = '<option value="">Selecione no Inventário...</option>';
        DB.filamentos.forEach(f => {
            const opt = document.createElement('option'); opt.value = f.id; opt.textContent = `${f.nome} (Disp: ${fmtNum(f.pesoRestante)}g)`; selectDesc.appendChild(opt);
        });
        selectDesc.value = valorDescAtual;
    }

    const listaExt = document.getElementById('calc-lista-extras');
    if(listaExt) {
        listaExt.innerHTML = '';
        DB.extras.forEach(x => {
            const sigla = x.medida === 'Unidades' ? 'un' : x.medida;
            listaExt.innerHTML += `
                <div class="flex-between" style="background: var(--bg-input); padding: 0.5rem; border-radius: 4px; border: 1px solid var(--border);">
                    <div><strong>${x.nome}</strong> <span style="font-size: 0.8rem; color: var(--text-muted)">(${fmtDinheiro(x.custoUnitario)}/${sigla})</span></div>
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <input type="number" class="calc-ext-uso" data-id="${x.id}" min="0" step="0.01" placeholder="0" style="width: 80px; padding: 0.4rem;">
                        <span>${sigla}</span>
                    </div>
                </div>`;
        });
    }
}

// ==========================================
// ABA 1: SIMULAÇÃO DE CUSTOS
// ==========================================
document.getElementById('form-calc').addEventListener('submit', (e) => {
    e.preventDefault();
    const nomeProduto = document.getElementById('calc-nome').value;
    
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
    if(filamentosUsados.length === 0) { alert("Selecione pelo menos um filamento."); return; }

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
            custoExt += (qtd * extra.custoUnitario);
            extrasUsados.push({ id: extId, nome: extra.nome, qtd: qtd, custoRef: extra.custoUnitario });
        }
    });

    const custoTotal = custoFil + custoEne + custoMan + custoExt;
    
    const m3 = custoTotal * 3;
    const m5 = custoTotal * 5;
    const shopeeM3 = (m3 + 4) / 0.8;
    const shopeeM5 = (m5 + 4) / 0.8;

    document.getElementById('res-custo-fil').textContent = fmtDinheiro(custoFil);
    document.getElementById('res-custo-ener').textContent = fmtDinheiro(custoEne + custoMan);
    document.getElementById('res-custo-ext').textContent = fmtDinheiro(custoExt);
    document.getElementById('res-custo-total').textContent = fmtDinheiro(custoTotal);
    
    document.getElementById('res-m3').textContent = fmtDinheiro(m3);
    document.getElementById('lucro-m3').textContent = `Lucro Líquido: ${fmtDinheiro(m3 - custoTotal)}`;
    document.getElementById('res-m5').textContent = fmtDinheiro(m5);
    document.getElementById('lucro-m5').textContent = `Lucro Líquido: ${fmtDinheiro(m5 - custoTotal)}`;
    
    document.getElementById('res-shopee-m3').textContent = fmtDinheiro(shopeeM3);
    document.getElementById('res-shopee-m5').textContent = fmtDinheiro(shopeeM5);

    document.getElementById('sim-shopee-preco').value = shopeeM5.toFixed(2);
    
    simulacaoAtual = { 
        id: editandoReceitaId || Date.now(), 
        nome: nomeProduto, 
        custoTotal, 
        filamentosUsados, 
        extrasUsados,
        params: { h, m, kw, precoKwh }
    };

    atualizarSimulacaoShopee(shopeeM5, custoTotal);
    document.getElementById('painel-resultados').style.display = 'block';
});

document.getElementById('sim-shopee-preco').addEventListener('input', (e) => {
    if(simulacaoAtual) atualizarSimulacaoShopee(parseFloat(e.target.value), simulacaoAtual.custoTotal);
});

function atualizarSimulacaoShopee(precoVenda, custo) {
    const elTaxa = document.getElementById('sim-shopee-taxa');
    const elLiq = document.getElementById('sim-shopee-liquido');
    const elLuc = document.getElementById('sim-shopee-lucro');
    const alertBox = document.getElementById('alerta-shopee');

    if(isNaN(precoVenda) || precoVenda <= 0) {
        elTaxa.textContent = 'R$ 0,00'; elLiq.textContent = 'R$ 0,00'; elLuc.textContent = 'R$ 0,00';
        alertBox.style.display = 'none'; return;
    }

    const taxa = 4 + (precoVenda * 0.20);
    const liquido = precoVenda - taxa;
    const lucro = liquido - custo;

    elTaxa.textContent = fmtDinheiro(taxa);
    elLiq.textContent = fmtDinheiro(liquido);
    elLuc.textContent = fmtDinheiro(lucro);
    elLuc.className = lucro >= 0 ? 'text-success' : 'text-danger';
    
    if(lucro < 0) {
        alertBox.className = 'alert-box alert-danger';
        alertBox.innerHTML = '🚨 PREJUÍZO! Venda não cobre taxas e custo de produção.';
        alertBox.style.display = 'block';
    } else if(lucro < 1) {
        alertBox.className = 'alert-box alert-warning';
        alertBox.innerHTML = '⚠️ SEM LUCRO! Vendendo a preço de custo.';
        alertBox.style.display = 'block';
    } else {
        alertBox.style.display = 'none';
    }
}

document.getElementById('btn-salvar-receita').addEventListener('click', async () => {
    if(!simulacaoAtual) return;
    
    if (editandoReceitaId) {
        const index = DB.receitas.findIndex(r => r.id === editandoReceitaId);
        if (index !== -1) DB.receitas[index] = simulacaoAtual;
        alert(`Receita "${simulacaoAtual.nome}" atualizada com sucesso!`);
    } else {
        DB.receitas.push(simulacaoAtual);
        alert(`Receita "${simulacaoAtual.nome}" salva no Catálogo!`);
    }

    await salvarDB();
    resetarSimulacao();
});

document.getElementById('btn-cancelar-edicao').addEventListener('click', () => {
    resetarSimulacao();
});

function resetarSimulacao() {
    document.getElementById('painel-resultados').style.display = 'none';
    document.getElementById('form-calc').reset();
    document.getElementById('btn-salvar-receita').innerHTML = "💾 Salvar Receita no Catálogo";
    document.getElementById('btn-cancelar-edicao').style.display = 'none';
    simulacaoAtual = null;
    editandoReceitaId = null;
}

// ==========================================
// ABA 2: CATÁLOGO DE PRODUTOS SALVOS
// ==========================================
function renderizarCatalogo() {
    const el = document.getElementById('lista-catalogo');
    if(!el) return;
    el.innerHTML = '';
    
    if(DB.receitas.length === 0) {
        el.innerHTML = '<p class="ajuda">Nenhuma receita salva no catálogo.</p>';
        return;
    }
    
    DB.receitas.forEach(r => {
        let fillTxt = r.filamentosUsados.map(f => `${fmtNum(f.peso)}g de ${f.nome}`).join(', ');
        let extTxt = r.extrasUsados && r.extrasUsados.length ? r.extrasUsados.map(ex => `${fmtNum(ex.qtd)}x ${ex.nome}`).join(', ') : 'Nenhum';
        
        el.innerHTML += `
        <div class="item-card" style="border-left: 4px solid var(--primary);">
            <div class="item-title">
                ${r.nome}
                <div style="display:flex; gap:0.3rem;">
                    <button type="button" class="btn-small" style="background-color: var(--warning); color: #000; border: none; border-radius: 4px; cursor: pointer;" onclick="editarReceita(${r.id})">✏️</button>
                    <button type="button" class="btn-danger btn-small" style="border: none; border-radius: 4px; cursor: pointer;" onclick="apagarReceita(${r.id})">X</button>
                </div>
            </div>
            <div class="item-details">
                <span style="color: var(--primary); font-weight: bold;">Custo Base: ${fmtDinheiro(r.custoTotal)}</span>
                <span style="font-size: 0.8rem; margin-top: 0.3rem;"><strong>Filamentos:</strong> ${fillTxt}</span>
                <span style="font-size: 0.8rem;"><strong>Insumos:</strong> ${extTxt}</span>
            </div>
        </div>`;
    });
}

function editarReceita(id) {
    const r = DB.receitas.find(x => x.id === id);
    if(!r) return;
    
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-calc').classList.add('active');
    document.querySelector('[data-tab="tab-calc"]').classList.add('active');
    
    document.getElementById('calc-nome').value = r.nome;
    for(let i=1; i<=4; i++) {
        document.getElementById(`calc-filamento-${i}`).value = "";
        document.getElementById(`calc-peso-${i}`).value = "";
    }
    r.filamentosUsados.forEach((fUsado, index) => {
        if(index < 4) {
            const i = index + 1;
            document.getElementById(`calc-filamento-${i}`).value = fUsado.id;
            document.getElementById(`calc-peso-${i}`).value = fUsado.peso;
        }
    });
    if(r.params) {
        document.getElementById('calc-horas').value = r.params.h || 0;
        document.getElementById('calc-minutos').value = r.params.m || 0;
        document.getElementById('calc-kw').value = r.params.kw || 0.15;
        document.getElementById('calc-preco-kwh').value = r.params.precoKwh || 0.95;
    }
    document.querySelectorAll('.calc-ext-uso').forEach(input => input.value = "");
    if(r.extrasUsados) {
        r.extrasUsados.forEach(eUsado => {
            const input = document.querySelector(`.calc-ext-uso[data-id="${eUsado.id}"]`);
            if(input) input.value = eUsado.qtd;
        });
    }
    editandoReceitaId = r.id;
    document.getElementById('btn-salvar-receita').innerHTML = "💾 Atualizar Receita no Catálogo";
    document.getElementById('btn-cancelar-edicao').style.display = 'block';
    document.getElementById('form-calc').dispatchEvent(new Event('submit'));
}

async function apagarReceita(id) {
    if(confirm("Deseja realmente excluir esta receita do catálogo?")) {
        DB.receitas = DB.receitas.filter(r => r.id !== id);
        await salvarDB(); renderizarCatalogo();
    }
}

// ==========================================
// ABA 3: FÁBRICA (Produção e Descarte)
// ==========================================
function atualizarSelectProduction() {
    const sel = document.getElementById('prod-receita');
    if(!sel) return;
    sel.innerHTML = '<option value="">Selecione um produto salvo no catálogo...</option>';
    DB.receitas.forEach(r => {
        const opt = document.createElement('option'); opt.value = r.id; opt.textContent = `${r.nome} (Custo Base: ${fmtDinheiro(r.custoTotal)})`; sel.appendChild(opt);
    });
}

document.getElementById('form-producao').addEventListener('submit', async (e) => {
    e.preventDefault();
    const receitaId = parseInt(document.getElementById('prod-receita').value);
    const qtdProduzir = parseInt(document.getElementById('prod-qtd').value);
    const receita = DB.receitas.find(r => r.id === receitaId);
    if(!receita) return;

    for(let fUsado of receita.filamentosUsados) {
        const fil = DB.filamentos.find(f => f.id === fUsado.id);
        if(!fil || fil.pesoRestante < (fUsado.peso * qtdProduzir)) {
            alert(`Falta filamento no inventário!`); return;
        }
    }

    receita.filamentosUsados.forEach(fUsado => {
        const fil = DB.filamentos.find(f => f.id === fUsado.id);
        fil.pesoRestante -= (fUsado.peso * qtdProduzir);
    });
    if(receita.extrasUsados) {
        receita.extrasUsados.forEach(eUsado => {
            const ext = DB.extras.find(ex => ex.id === eUsado.id);
            ext.qtdRestante -= (eUsado.qtd * qtdProduzir);
        });
    }

    let itemEstoque = DB.estoqueProntos.find(p => p.receitaId === receita.id);
    if(itemEstoque) {
        itemEstoque.quantidade += qtdProduzir;
    } else {
        DB.estoqueProntos.push({ id: Date.now(), receitaId: receita.id, nome: receita.nome, custoUnitario: receita.custoTotal, quantidade: qtdProduzir });
    }

    DB.historicoProducao.push({
        id: Date.now(), data: new Date().toLocaleDateString('pt-BR'),
        nomeProduto: receita.nome, quantidade: qtdProduzir, custoTotalFornada: receita.custoTotal * qtdProduzir
    });

    await salvarDB();
    alert(`📦 Produção de ${qtdProduzir}x "${receita.nome}" enviada para estoque pronto.`);
    document.getElementById('form-producao').reset();
    atualizarSelectsDinamicos();
});

document.getElementById('form-descarte').addEventListener('submit', async (e) => {
    e.preventDefault();
    const tipo = document.getElementById('desc-tipo').value;
    const filId = parseInt(document.getElementById('desc-filamento').value);
    const peso = parseFloat(document.getElementById('desc-peso').value);
    const horas = parseFloat(document.getElementById('desc-horas').value) || 0;
    const min = parseFloat(document.getElementById('desc-min').value) || 0;
    const motivo = document.getElementById('desc-motivo').value || 'Não informado';

    const fil = DB.filamentos.find(f => f.id === filId);
    if(!fil || peso > fil.pesoRestante) { alert("Estoque insuficiente."); return; }

    const custoMaterial = peso * fil.custoPorGrama;
    const custoEletrico = (horas + (min / 60)) * 0.15 * 0.95;
    const custoTotalPerda = custoMaterial + custoEletrico;

    fil.pesoRestante -= peso;
    DB.historicoPerdas.push({ id: Date.now(), data: new Date().toLocaleDateString('pt-BR'), tipo, filamentoNome: fil.nome, pesoGasto: peso, tempoGasto: `${horas}h ${min}m`, custoTotal: custoTotalPerda, motivo });
    
    // Lança a perda elétrica/descarte também nas saídas do caixa
    DB.historicoGastos.push({ id: Date.now(), data: new Date().toLocaleDateString('pt-BR'), descricao: `Perda (${tipo}): ${fil.nome}`, valor: custoTotalPerda });

    await salvarDB(); alert(`🗑️ Perda registrada.`); document.getElementById('form-descarte').reset(); atualizarSelectsDinamicos(); 
});

// ==========================================
// ABA 5: VENDAS
// ==========================================
function renderizarAbaVendas() {
    const elLista = document.getElementById('lista-estoque-prontos');
    elLista.innerHTML = '';
    DB.estoqueProntos.forEach(p => {
        elLista.innerHTML += `
            <div class="item-card" style="border-left: 4px solid var(--primary);">
                <div class="item-title">${p.nome}</div>
                <div class="item-details"><span style="font-weight:bold;">Estoque: ${p.quantidade} un.</span><span>Custo: ${fmtDinheiro(p.custoUnitario)}</span></div>
            </div>`;
    });

    const selectVenda = document.getElementById('venda-produto');
    selectVenda.innerHTML = '<option value="">Selecione no estoque pronto...</option>';
    DB.estoqueProntos.forEach(p => {
        if(p.quantidade > 0) {
            const opt = document.createElement('option'); opt.value = p.id; opt.textContent = `${p.nome} (${p.quantidade})`; selectVenda.appendChild(opt);
        }
    });
}

const calcularPrevVenda = () => {
    const prodId = parseInt(document.getElementById('venda-produto').value);
    const qtd = parseInt(document.getElementById('venda-qtd').value) || 0;
    const canal = document.getElementById('venda-canal').value;
    const precoUni = parseFloat(document.getElementById('venda-preco').value) || 0;

    const elCusto = document.getElementById('prev-custo');
    const elTaxa = document.getElementById('prev-taxa');
    const elLucro = document.getElementById('prev-lucro');

    if(!prodId || qtd <= 0 || precoUni <= 0) { elCusto.textContent = "R$ 0,00"; elTaxa.textContent = "R$ 0,00"; elLucro.textContent = "R$ 0,00"; return; }
    const produto = DB.estoqueProntos.find(p => p.id === prodId);
    if(!produto) return;

    const custoTotalFornada = produto.custoUnitario * qtd;
    const receitaBruta = precoUni * qtd;
    let taxaTotal = canal === 'Shopee' ? ((precoUni * 0.20) + 4) * qtd : 0;
    const lucroLiquido = receitaBruta - custoTotalFornada - taxaTotal;

    elCusto.textContent = fmtDinheiro(custoTotalFornada);
    elTaxa.textContent = fmtDinheiro(taxaTotal);
    elLucro.textContent = fmtDinheiro(lucroLiquido);
    elLucro.className = lucroLiquido > 0 ? 'text-success' : 'text-danger';
};

document.getElementById('venda-produto').addEventListener('change', calcularPrevVenda);
document.getElementById('venda-qtd').addEventListener('input', calcularPrevVenda);
document.getElementById('venda-canal').addEventListener('change', calcularPrevVenda);
document.getElementById('venda-preco').addEventListener('input', calcularPrevVenda);

document.getElementById('form-venda').addEventListener('submit', async (e) => {
    e.preventDefault();
    const prodId = parseInt(document.getElementById('venda-produto').value);
    const qtd = parseInt(document.getElementById('venda-qtd').value);
    const canal = document.getElementById('venda-canal').value;
    const precoUni = parseFloat(document.getElementById('venda-preco').value);

    const produto = DB.estoqueProntos.find(p => p.id === prodId);
    if(qtd > produto.quantidade) { alert("Estoque pronto insuficiente!"); return; }

    const custoTotalFab = produto.custoUnitario * qtd;
    let taxa = canal === 'Shopee' ? ((precoUni * 0.20) + 4) * qtd : 0;
    const lucro = (precoUni * qtd) - custoTotalFab - taxa;

    produto.quantidade -= qtd;
    if(produto.quantidade === 0) { DB.estoqueProntos = DB.estoqueProntos.filter(p => p.id !== prodId); }

    DB.historicoVendas.push({ id: Date.now(), data: new Date().toLocaleDateString('pt-BR'), nomeProduto: produto.nome, quantidade: qtd, canal, precoVendaTotal: (precoUni * qtd), taxa, lucroLiquido: lucro });
    await salvarDB(); alert(`💲 Venda registrada.`); document.getElementById('form-venda').reset(); calcularPrevVenda(); renderizarAbaVendas();
});

// ==========================================
// ABA 6: HISTÓRICO & BALANÇO FINANCEIRO
// ==========================================
function renderizarHistoricos() {
    // 1. Cálculo de Fluxo de Caixa Centralizado
    const totalEntrou = DB.historicoVendas.reduce((acc, v) => acc + v.precoVendaTotal, 0);
    
    // Se for o primeiro boot pós-atualização e a nuvem não tiver histórico de gastos,
    // popula retroativamente com os custos de aquisição do inventário atual para manter a consistência.
    if (!DB.historicoGastos || DB.historicoGastos.length === 0) {
        DB.historicoGastos = [];
        DB.filamentos.forEach(f => DB.historicoGastos.push({ id: f.id, data: 'Legado', descricao: `Compra: Rolo ${f.nome}`, valor: f.precoTotal }));
        DB.extras.forEach(x => DB.historicoGastos.push({ id: x.id, data: 'Legado', descricao: `Compra: Insumo ${x.nome}`, valor: x.precoTotal }));
        salvarDB();
    }
    
    const totalSaiu = DB.historicoGastos.reduce((acc, g) => acc + g.valor, 0);

    // Injeta os valores calculados nos elementos do Dashboard da aba 6
    document.getElementById('dash-entrou').textContent = fmtDinheiro(totalEntrou);
    document.getElementById('dash-saiu').textContent = fmtDinheiro(totalSaiu);

    // 2. Renderização das Listas de Histórico
    const elVendas = document.getElementById('lista-historico-vendas');
    elVendas.innerHTML = '';
    if(DB.historicoVendas.length === 0) elVendas.innerHTML = '<p class="ajuda">Nenhuma venda registrada.</p>';
    [...DB.historicoVendas].reverse().forEach(v => {
        elVendas.innerHTML += `
            <div class="card card-alt" style="margin-bottom: 0; border-left: 4px solid var(--success);">
                <div class="flex-between"><strong>${v.quantidade}x ${v.nomeProduto}</strong><span class="badge">${v.data}</span></div>
                <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.5rem;">Canal: ${v.canal} | Recebido: ${fmtDinheiro(v.precoVendaTotal)}</div>
                <div class="res-row destaque" style="border:none; padding:0; margin-top:0.3rem;"><span>Lucro Real:</span><strong class="text-success">${fmtDinheiro(v.lucroLiquido)}</strong></div>
            </div>`;
    });

    const elProducao = document.getElementById('lista-historico-producao');
    elProducao.innerHTML = '';
    if(DB.historicoProducao.length === 0) elProducao.innerHTML = '<p class="ajuda">Nenhuma produção registrada.</p>';
    [...DB.historicoProducao].reverse().forEach(p => {
        elProducao.innerHTML += `
            <div class="card card-alt" style="margin-bottom: 0; border-left: 4px solid var(--primary);">
                <div class="flex-between"><strong>${p.quantidade}x ${p.nomeProduto} fabricados</strong><span class="badge">${p.data}</span></div>
            </div>`;
    });

    const elPerdas = document.getElementById('lista-historico-perdas');
    elPerdas.innerHTML = '';
    if(!DB.historicoPerdas || DB.historicoPerdas.length === 0) elPerdas.innerHTML = '<p class="ajuda">Nenhum descarte.</p>';
    [...DB.historicoPerdas].reverse().forEach(p => {
        elPerdas.innerHTML += `
            <div class="card card-alt" style="margin-bottom: 0; border-left: 4px solid var(--warning);">
                <div class="flex-between"><strong>${p.tipo}: ${p.pesoGasto}g em ${p.filamentoNome}</strong><span class="badge">${p.data}</span></div>
                <div style="font-size:0.85rem; color:var(--text-muted); margin-top:0.3rem;">Motivo: ${p.motivo}</div>
                <div class="res-row destaque" style="border:none; padding:0;"><span style="color:var(--text-muted);">Prejuízo:</span><strong class="text-danger">-${fmtDinheiro(p.custoTotal)}</strong></div>
            </div>`;
    });
}

function iniciarApp() {
    atualizarSelectsDinamicos();
}

document.addEventListener('DOMContentLoaded', iniciarNuvem);