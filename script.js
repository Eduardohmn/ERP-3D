// --- UTILITÁRIOS ---
const fmtDinheiro = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtNum = (v) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// --- ESTADO DO BANCO DE DADOS (LOCALSTORAGE) ---
let DB = {
    filamentos: JSON.parse(localStorage.getItem('db_filamentos')) || [],
    extras: JSON.parse(localStorage.getItem('db_extras')) || [],
    receitas: JSON.parse(localStorage.getItem('db_receitas')) || [],
    estoqueProntos: JSON.parse(localStorage.getItem('db_estoque_prontos')) || [],
    historicoProducao: JSON.parse(localStorage.getItem('db_hist_producao')) || [],
    historicoVendas: JSON.parse(localStorage.getItem('db_hist_vendas')) || []
};
let simulacaoAtual = null;

const salvarDB = () => {
    localStorage.setItem('db_filamentos', JSON.stringify(DB.filamentos));
    localStorage.setItem('db_extras', JSON.stringify(DB.extras));
    localStorage.setItem('db_receitas', JSON.stringify(DB.receitas));
    localStorage.setItem('db_estoque_prontos', JSON.stringify(DB.estoqueProntos));
    localStorage.setItem('db_hist_producao', JSON.stringify(DB.historicoProducao));
    localStorage.setItem('db_hist_vendas', JSON.stringify(DB.historicoVendas));
};

// --- NAVEGAÇÃO DE ABAS ---
document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
        
        const tabId = e.target.getAttribute('data-tab');
        document.getElementById(tabId).classList.add('active');
        e.target.classList.add('active');
        
        if(tabId === 'tab-calc') { atualizarFormularioCalculo(); atualizarSelectProducao(); }
        if(tabId === 'tab-inv') renderizarInventario();
        if(tabId === 'tab-vendas') renderizarAbaVendas();
        if(tabId === 'tab-hist') renderizarHistoricos();
    });
});

// ==========================================
// ABA 2: INVENTÁRIO INSUMOS
// ==========================================
document.getElementById('form-filamento').addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = document.getElementById('fil-nome').value;
    const peso = parseFloat(document.getElementById('fil-peso').value);
    const preco = parseFloat(document.getElementById('fil-preco').value);
    DB.filamentos.push({ id: Date.now(), nome, pesoInicial: peso, pesoRestante: peso, precoTotal: preco, custoPorGrama: preco / peso });
    salvarDB(); document.getElementById('form-filamento').reset(); renderizarInventario();
});

document.getElementById('form-extra').addEventListener('submit', (e) => {
    e.preventDefault();
    const nome = document.getElementById('ext-nome').value;
    const medida = document.getElementById('ext-medida').value;
    const qtd = parseFloat(document.getElementById('ext-qtd').value);
    const preco = parseFloat(document.getElementById('ext-preco').value);
    DB.extras.push({ id: Date.now(), nome, medida, qtdInicial: qtd, qtdRestante: qtd, precoTotal: preco, custoUnitario: preco / qtd });
    salvarDB(); document.getElementById('form-extra').reset(); renderizarInventario();
});

function renderizarInventario() {
    const elFil = document.getElementById('lista-filamentos');
    elFil.innerHTML = '';
    DB.filamentos.forEach(f => {
        const perc = (f.pesoRestante / f.pesoInicial) * 100;
        let cor = perc <= 15 ? 'stock-low' : (perc <= 50 ? 'stock-warn' : 'stock-good');
        elFil.innerHTML += `
            <div class="item-card">
                <div class="item-title">${f.nome} <button type="button" class="btn-danger btn-small" onclick="apagarFil(${f.id})">X</button></div>
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
                <div class="item-title">${x.nome} <button type="button" class="btn-danger btn-small" onclick="apagarExt(${x.id})">X</button></div>
                <div class="item-details">
                    <span>Custo: ${fmtDinheiro(x.custoUnitario)} / ${sigla}</span>
                    <span style="font-weight: bold;">Resta: ${fmtNum(x.qtdRestante)} ${sigla}</span>
                </div>
                <div class="stock-bar-bg"><div class="stock-bar-fill ${cor}" style="width: ${perc}%"></div></div>
            </div>`;
    });
}
function apagarFil(id) { if(confirm("Apagar filamento?")) { DB.filamentos = DB.filamentos.filter(f => f.id !== id); salvarDB(); renderizarInventario(); } }
function apagarExt(id) { if(confirm("Apagar insumo?")) { DB.extras = DB.extras.filter(x => x.id !== id); salvarDB(); renderizarInventario(); } }

// ==========================================
// ABA 1: PRODUTOS E PRODUÇÃO (Engenharia)
// ==========================================
function atualizarFormularioCalculo() {
    for(let i=1; i<=4; i++) {
        const selectFil = document.getElementById(`calc-filamento-${i}`);
        const valorAtual = selectFil.value;
        selectFil.innerHTML = i === 1 ? '<option value="">Selecione no Inventário...</option>' : '<option value="">Nenhum...</option>';
        DB.filamentos.forEach(f => {
            const opt = document.createElement('option'); opt.value = f.id; opt.textContent = `${f.nome}`; selectFil.appendChild(opt);
        });
        selectFil.value = valorAtual;
    }

    const listaExt = document.getElementById('calc-lista-extras');
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

// 1. Ação de Simular
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

    document.getElementById('res-custo-fil').textContent = fmtDinheiro(custoFil);
    document.getElementById('res-custo-ener').textContent = fmtDinheiro(custoEne + custoMan);
    document.getElementById('res-custo-ext').textContent = fmtDinheiro(custoExt);
    document.getElementById('res-custo-total').textContent = fmtDinheiro(custoTotal);
    
    simulacaoAtual = { id: Date.now(), nome: nomeProduto, custoTotal, filamentosUsados, extrasUsados };
    document.getElementById('painel-resultados').style.display = 'block';
});

// 2. Ação de Salvar Receita no Catálogo
document.getElementById('btn-salvar-receita').addEventListener('click', () => {
    if(!simulacaoAtual) return;
    DB.receitas.push(simulacaoAtual);
    salvarDB();
    alert(`Receita "${simulacaoAtual.nome}" salva no Catálogo!`);
    document.getElementById('painel-resultados').style.display = 'none';
    document.getElementById('form-calc').reset();
    simulacaoAtual = null;
    atualizarSelectProducao();
});

function atualizarSelectProducao() {
    const sel = document.getElementById('prod-receita');
    sel.innerHTML = '<option value="">Selecione um produto salvo...</option>';
    DB.receitas.forEach(r => {
        const opt = document.createElement('option'); opt.value = r.id; opt.textContent = `${r.nome} (Custo Médio: ${fmtDinheiro(r.custoTotal)})`; sel.appendChild(opt);
    });
}

// 3. Ação de Registrar Produção (Fábrica)
document.getElementById('form-producao').addEventListener('submit', (e) => {
    e.preventDefault();
    const receitaId = parseInt(document.getElementById('prod-receita').value);
    const qtdProduzir = parseInt(document.getElementById('prod-qtd').value);
    const receita = DB.receitas.find(r => r.id === receitaId);
    
    if(!receita) return;

    // Checagem de Estoque
    for(let fUsado of receita.filamentosUsados) {
        const fil = DB.filamentos.find(f => f.id === fUsado.id);
        if(!fil || fil.pesoRestante < (fUsado.peso * qtdProduzir)) {
            alert(`Falta filamento! A receita precisa de ${fmtNum(fUsado.peso * qtdProduzir)}g de "${fUsado.nome}".`); return;
        }
    }
    for(let eUsado of receita.extrasUsados) {
        const ext = DB.extras.find(ex => ex.id === eUsado.id);
        if(!ext || ext.qtdRestante < (eUsado.qtd * qtdProduzir)) {
            alert(`Falta insumo! A receita precisa de ${fmtNum(eUsado.qtd * qtdProduzir)} de "${eUsado.nome}".`); return;
        }
    }

    // Baixa de Estoque
    receita.filamentosUsados.forEach(fUsado => {
        const fil = DB.filamentos.find(f => f.id === fUsado.id);
        fil.pesoRestante -= (fUsado.peso * qtdProduzir);
    });
    receita.extrasUsados.forEach(eUsado => {
        const ext = DB.extras.find(ex => ex.id === eUsado.id);
        ext.qtdRestante -= (eUsado.qtd * qtdProduzir);
    });

    // Subir Estoque de Produto Pronto
    let itemEstoque = DB.estoqueProntos.find(p => p.receitaId === receita.id);
    if(itemEstoque) {
        itemEstoque.quantidade += qtdProduzir;
        itemEstoque.custoUnitario = receita.custoTotal; // Atualiza pro custo da última fornada
    } else {
        DB.estoqueProntos.push({ id: Date.now(), receitaId: receita.id, nome: receita.nome, custoUnitario: receita.custoTotal, quantidade: qtdProduzir });
    }

    // Registrar Histórico
    DB.historicoProducao.push({
        id: Date.now(), data: new Date().toLocaleDateString('pt-BR', {hour: '2-digit', minute:'2-digit'}),
        nomeProduto: receita.nome, quantidade: qtdProduzir, custoTotalFornada: receita.custoTotal * qtdProduzir
    });

    salvarDB();
    alert(`📦 Sucesso! ${qtdProduzir} unidade(s) de "${receita.nome}" fabricadas e adicionadas ao estoque pronto.`);
    document.getElementById('form-producao').reset();
});

// ==========================================
// ABA 3: VENDAS E ESTOQUE PRONTO
// ==========================================
function renderizarAbaVendas() {
    // Render Lista Estoque
    const elLista = document.getElementById('lista-estoque-prontos');
    elLista.innerHTML = '';
    if(DB.estoqueProntos.length === 0) elLista.innerHTML = '<p class="ajuda">Nenhum produto pronto no estoque.</p>';
    
    DB.estoqueProntos.forEach(p => {
        elLista.innerHTML += `
            <div class="item-card" style="border-left: 4px solid var(--primary);">
                <div class="item-title">${p.nome}</div>
                <div class="item-details">
                    <span style="font-weight: bold; font-size: 1rem; color: var(--text-main);">Em estoque: ${p.quantidade} un.</span>
                    <span>Custo de Fab.: ${fmtDinheiro(p.custoUnitario)}</span>
                </div>
            </div>`;
    });

    // Popula Select Venda
    const selectVenda = document.getElementById('venda-produto');
    selectVenda.innerHTML = '<option value="">Selecione no estoque pronto...</option>';
    DB.estoqueProntos.forEach(p => {
        if(p.quantidade > 0) {
            const opt = document.createElement('option'); opt.value = p.id; opt.textContent = `${p.nome} (Disp: ${p.quantidade})`; selectVenda.appendChild(opt);
        }
    });
}

// Simulador Dinâmico de Lucro na Venda
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
    let taxaTotal = 0;

    if(canal === 'Shopee') {
        // Shopee cobra 20% + R$ 4 por unidade vendida (na maioria dos casos)
        taxaTotal = ((precoUni * 0.20) + 4) * qtd; 
    }

    const lucroLiquido = receitaBruta - custoTotalFornada - taxaTotal;

    elCusto.textContent = fmtDinheiro(produto.custoUnitario);
    elTaxa.textContent = fmtDinheiro(taxaTotal);
    elLucro.textContent = fmtDinheiro(lucroLiquido);
    elLucro.className = lucroLiquido > 0 ? 'text-success' : 'text-danger';
};

document.getElementById('venda-produto').addEventListener('change', calcularPrevVenda);
document.getElementById('venda-qtd').addEventListener('input', calcularPrevVenda);
document.getElementById('venda-canal').addEventListener('change', calcularPrevVenda);
document.getElementById('venda-preco').addEventListener('input', calcularPrevVenda);

// Registrar Venda
document.getElementById('form-venda').addEventListener('submit', (e) => {
    e.preventDefault();
    const prodId = parseInt(document.getElementById('venda-produto').value);
    const qtd = parseInt(document.getElementById('venda-qtd').value);
    const canal = document.getElementById('venda-canal').value;
    const precoUni = parseFloat(document.getElementById('venda-preco').value);

    const produto = DB.estoqueProntos.find(p => p.id === prodId);
    if(qtd > produto.quantidade) { alert("Você não tem essa quantidade no estoque de produtos prontos!"); return; }

    const custoTotalFab = produto.custoUnitario * qtd;
    let taxa = 0;
    if(canal === 'Shopee') { taxa = ((precoUni * 0.20) + 4) * qtd; }
    
    const lucro = (precoUni * qtd) - custoTotalFab - taxa;

    // Baixar Produto Pronto
    produto.quantidade -= qtd;
    if(produto.quantidade === 0) { DB.estoqueProntos = DB.estoqueProntos.filter(p => p.id !== prodId); }

    // Salvar Histórico de Vendas
    DB.historicoVendas.push({
        id: Date.now(), data: new Date().toLocaleDateString('pt-BR', {hour: '2-digit', minute:'2-digit'}),
        nomeProduto: produto.nome, quantidade: qtd, canal, precoVendaTotal: (precoUni * qtd), taxa, lucroLiquido: lucro
    });

    salvarDB();
    alert(`💲 Venda registrada com sucesso! Lucro apurado: ${fmtDinheiro(lucro)}`);
    document.getElementById('form-venda').reset();
    calcularPrevVenda();
    renderizarAbaVendas();
});

// ==========================================
// ABA 4: HISTÓRICO GERAL
// ==========================================
function renderizarHistoricos() {
    const elVendas = document.getElementById('lista-historico-vendas');
    elVendas.innerHTML = '';
    if(DB.historicoVendas.length === 0) elVendas.innerHTML = '<p class="ajuda">Nenhuma venda registrada.</p>';
    
    [...DB.historicoVendas].reverse().forEach(v => {
        elVendas.innerHTML += `
            <div class="card card-alt" style="margin-bottom: 0; border-left: 4px solid var(--success);">
                <div class="flex-between">
                    <strong style="color: var(--text-main);">${v.quantidade}x ${v.nomeProduto}</strong>
                    <span class="badge">${v.data}</span>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">
                    Canal: <strong>${v.canal}</strong> | Faturamento: <strong>${fmtDinheiro(v.precoVendaTotal)}</strong>
                </div>
                <div class="res-row destaque" style="border:none; padding:0; margin-top:0.3rem;">
                    <span style="font-size: 0.9rem;">Lucro Líquido Real:</span>
                    <strong class="${v.lucroLiquido > 0 ? 'text-success' : 'text-danger'}">${fmtDinheiro(v.lucroLiquido)}</strong>
                </div>
            </div>`;
    });

    const elProducao = document.getElementById('lista-historico-producao');
    elProducao.innerHTML = '';
    if(DB.historicoProducao.length === 0) elProducao.innerHTML = '<p class="ajuda">Nenhuma produção registrada.</p>';

    [...DB.historicoProducao].reverse().forEach(p => {
        elProducao.innerHTML += `
            <div class="card card-alt" style="margin-bottom: 0; border-left: 4px solid var(--primary);">
                <div class="flex-between">
                    <strong style="color: var(--text-main);">${p.quantidade}x ${p.nomeProduto} fabricados</strong>
                    <span class="badge">${p.data}</span>
                </div>
                <div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 0.5rem;">
                    Custo total da fornada: <strong>${fmtDinheiro(p.custoTotalFornada)}</strong>
                </div>
            </div>`;
    });
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    atualizarFormularioCalculo();
    atualizarSelectProducao();
});