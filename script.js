// FORMATADOR DE MOEDA
const formatarMoeda = (valor) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor);

// ESTADO DA APLICAÇÃO
let extras = JSON.parse(localStorage.getItem('extras')) || [];
let produtos = JSON.parse(localStorage.getItem('produtos')) || [];
let produtoTemporario = null; 
let custoTotalGlobal = 0; // Armazena o custo temporariamente para o simulador

// INICIALIZAÇÃO
document.addEventListener('DOMContentLoaded', () => {
    renderizarExtras();
    renderizarInputsExtras();
    renderizarProdutos();
});

// ==========================================
// SEÇÃO 1: INSUMOS EXTRAS (CALCULADORA DE LOTE/METRAGEM)
// ==========================================
document.getElementById('form-extra').addEventListener('submit', function(e) {
    e.preventDefault();
    const nome = document.getElementById('extra-nome').value;
    const medida = document.getElementById('extra-medida').value;
    const qtd = parseFloat(document.getElementById('extra-qtd').value);
    const preco = parseFloat(document.getElementById('extra-preco').value);

    const custoUnitario = preco / qtd;

    const novoExtra = {
        id: Date.now(),
        nome: nome,
        medida: medida,
        custoUnitario: custoUnitario
    };

    extras.push(novoExtra);
    localStorage.setItem('extras', JSON.stringify(extras));
    
    document.getElementById('form-extra').reset();
    renderizarExtras();
    renderizarInputsExtras();
});

function renderizarExtras() {
    const lista = document.getElementById('lista-extras');
    lista.innerHTML = '';
    
    if (extras.length === 0) {
        lista.innerHTML = '<p class="ajuda-texto">Nenhum insumo cadastrado.</p>';
        return;
    }

    extras.forEach(extra => {
        const div = document.createElement('div');
        div.className = 'item-salvo';
        div.innerHTML = `
            <div class="item-info">
                <span>${extra.nome}</span>
                <span class="item-preco">${formatarMoeda(extra.custoUnitario)} por ${extra.medida.replace(/s$/, '')}</span>
            </div>
            <button class="btn-remover" onclick="removerExtra(${extra.id})">Apagar</button>
        `;
        lista.appendChild(div);
    });
}

function removerExtra(id) {
    extras = extras.filter(e => e.id !== id);
    localStorage.setItem('extras', JSON.stringify(extras));
    renderizarExtras();
    renderizarInputsExtras();
}

function renderizarInputsExtras() {
    const container = document.getElementById('selecao-extras');
    container.innerHTML = '';

    if (extras.length === 0) {
        container.innerHTML = '<p class="ajuda-texto">Cadastre insumos no passo 1 para usá-los aqui.</p>';
        return;
    }

    extras.forEach(extra => {
        const div = document.createElement('div');
        div.className = 'item-uso';
        const nomeMedida = extra.medida === 'Unidades' ? 'Unid.' : extra.medida;
        
        div.innerHTML = `
            <div class="item-uso-info">
                <strong>${extra.nome}</strong>
                <span>(${formatarMoeda(extra.custoUnitario)} / ${nomeMedida})</span>
            </div>
            <div class="item-uso-input">
                <input type="number" min="0" step="0.01" class="input-extra-uso" data-id="${extra.id}" placeholder="0">
                <span>${nomeMedida}</span>
            </div>
        `;
        container.appendChild(div);
    });
}

// ==========================================
// SEÇÃO 2: CALCULADORA PRINCIPAL E SHOPEE
// ==========================================
document.getElementById('calc-form').addEventListener('submit', function(e) {
    e.preventDefault();

    const nomeProduto = document.getElementById('nome-produto').value;
    const peso = parseFloat(document.getElementById('peso').value);
    const precoKg = parseFloat(document.getElementById('preco-kg').value);
    const horas = parseFloat(document.getElementById('horas').value) || 0;
    const minutos = parseFloat(document.getElementById('minutos').value) || 0;
    const consumoKw = parseFloat(document.getElementById('consumo').value);
    const precoKwh = parseFloat(document.getElementById('preco-kwh').value);

    const custoFilamento = (peso / 1000) * precoKg;
    const tempoEmHoras = horas + (minutos / 60);
    const custoEnergia = tempoEmHoras * consumoKw * precoKwh;
    const custoManutencao = (custoFilamento + custoEnergia) * 0.01;
    const custoBase3D = custoFilamento + custoEnergia + custoManutencao;

    let custoExtras = 0;
    let extrasSelecionados = [];
    const inputsExtra = document.querySelectorAll('.input-extra-uso');
    
    inputsExtra.forEach(input => {
        const qtdUsada = parseFloat(input.value) || 0;
        if (qtdUsada > 0) {
            const idExtra = parseInt(input.getAttribute('data-id'));
            const extraRef = extras.find(ex => ex.id === idExtra);
            
            if (extraRef) {
                const custoDesteItem = qtdUsada * extraRef.custoUnitario;
                custoExtras += custoDesteItem;
                extrasSelecionados.push(`${qtdUsada} ${extraRef.medida} de ${extraRef.nome}`);
            }
        }
    });

    const custoTotal = custoBase3D + custoExtras;
    custoTotalGlobal = custoTotal; // Guarda para o simulador usar depois

    const markup3 = custoTotal * 3;
    const markup5 = custoTotal * 5;
    
    const lucroM3 = markup3 - custoTotal;
    const lucroM5 = markup5 - custoTotal;
    
    const shopeeM3 = (markup3 + 4) / 0.8;
    const shopeeM5 = (markup5 + 4) / 0.8;

    // Atualiza a Tela
    document.getElementById('res-nome-produto').textContent = nomeProduto;
    document.getElementById('res-custo-base').textContent = formatarMoeda(custoBase3D);
    document.getElementById('res-custo-extras').textContent = formatarMoeda(custoExtras);
    document.getElementById('res-total').textContent = formatarMoeda(custoTotal);
    
    document.getElementById('res-markup3').textContent = formatarMoeda(markup3);
    document.getElementById('lucro-m3').textContent = `Lucro Real: ${formatarMoeda(lucroM3)}`;
    
    document.getElementById('res-markup5').textContent = formatarMoeda(markup5);
    document.getElementById('lucro-m5').textContent = `Lucro Real: ${formatarMoeda(lucroM5)}`;
    
    document.getElementById('res-shopee-m3').textContent = formatarMoeda(shopeeM3);
    document.getElementById('res-shopee-m5').textContent = formatarMoeda(shopeeM5);

    document.getElementById('simular-preco').value = shopeeM5.toFixed(2);
    calcularSimulacaoShopee(shopeeM5);
    
    document.getElementById('resultados').classList.remove('oculto');

    produtoTemporario = {
        id: null,
        nome: nomeProduto,
        custoTotal: custoTotal,
        markup5: markup5,
        lucroM5: lucroM5,
        shopeeM5: shopeeM5,
        extrasTexto: extrasSelecionados.length > 0 ? extrasSelecionados.join(' | ') : 'Nenhum insumo'
    };
});

// Simulador Dinâmico Shopee (Agora com cálculo de lucro e alertas)
function calcularSimulacaoShopee(precoAnuncio) {
    const elTaxa = document.getElementById('res-shopee-taxa-retida');
    const elLiquido = document.getElementById('res-shopee-liquido');
    const elLucro = document.getElementById('res-shopee-lucro');
    const elAlerta = document.getElementById('alerta-lucro');

    // Remove cores anteriores
    elLucro.className = '';
    elAlerta.className = 'alerta oculto';

    if (isNaN(precoAnuncio) || precoAnuncio <= 0) {
        elTaxa.textContent = formatarMoeda(0);
        elLiquido.textContent = formatarMoeda(0);
        elLucro.textContent = formatarMoeda(0);
        return;
    }
    
    // Matemática da Plataforma
    const taxaTotal = 4 + (precoAnuncio * 0.20);
    const valorLiquido = precoAnuncio - taxaTotal;
    const lucroReal = valorLiquido - custoTotalGlobal;
    
    elTaxa.textContent = formatarMoeda(taxaTotal);
    elLiquido.textContent = formatarMoeda(valorLiquido);
    elLucro.textContent = formatarMoeda(lucroReal);

    // Sistema de Avisos e Cores
    if (lucroReal < 0) {
        elLucro.classList.add('lucro-negativo');
        elAlerta.textContent = "🚨 PREJUÍZO! O valor da venda não cobre nem os custos de produção e taxa.";
        elAlerta.classList.remove('oculto');
        elAlerta.classList.add('alerta-perigo');
    } 
    else if (lucroReal >= 0 && lucroReal < 0.50) { 
        // Se o lucro for zero (ou centavos residuais)
        elLucro.classList.add('lucro-atencao');
        elAlerta.textContent = "⚠️ SEM LUCRO! Você está vendendo a preço de custo. Não há margem para ganhar dinheiro.";
        elAlerta.classList.remove('oculto');
        elAlerta.classList.add('alerta-atencao');
    } 
    else {
        elLucro.classList.add('lucro-positivo');
    }
}

document.getElementById('simular-preco').addEventListener('input', function() {
    calcularSimulacaoShopee(parseFloat(this.value));
});

// ==========================================
// SEÇÃO 3: HISTÓRICO DE PRODUTOS E BOTÃO SALVAR
// ==========================================
document.getElementById('btn-salvar-historico').addEventListener('click', function() {
    if (produtoTemporario) {
        produtoTemporario.id = Date.now(); 
        
        produtos.push(produtoTemporario);
        localStorage.setItem('produtos', JSON.stringify(produtos));
        renderizarProdutos();
        
        alert("✅ Produto salvo no histórico com sucesso!");
        produtoTemporario = null; 
    } else {
        alert("Nenhum cálculo novo para salvar. Faça uma simulação primeiro.");
    }
});

function renderizarProdutos() {
    const lista = document.getElementById('lista-produtos');
    lista.innerHTML = '';
    
    if (produtos.length === 0) {
        lista.innerHTML = '<p class="ajuda-texto">Nenhum produto calculado e salvo ainda.</p>';
        return;
    }

    produtos.slice().reverse().forEach(prod => {
        const div = document.createElement('div');
        div.className = 'item-salvo';
        div.innerHTML = `
            <div class="item-info">
                <strong>${prod.nome}</strong>
                <span style="font-size: 0.85rem; color:#aaa">Custo Produção: ${formatarMoeda(prod.custoTotal)}</span>
                <span class="item-preco">Sugerido Shopee (M5): ${formatarMoeda(prod.shopeeM5)} (Lucro: ${formatarMoeda(prod.lucroM5)})</span>
                <span style="font-size: 0.8rem; color:#888">Detalhes: ${prod.extrasTexto}</span>
            </div>
            <button class="btn-remover" onclick="removerProduto(${prod.id})">Apagar</button>
        `;
        lista.appendChild(div);
    });
}

function removerProduto(id) {
    produtos = produtos.filter(p => p.id !== id);
    localStorage.setItem('produtos', JSON.stringify(produtos));
    renderizarProdutos();
}