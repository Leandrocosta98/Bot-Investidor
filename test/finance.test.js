const {calcularPrecoAlvo} = require('../src/services/financeService');

describe('Testes de lógica financeira - Calculo de Preço Alvo', () => {

test('Deve calcular corretamente uma queda de 10% em uma ação',() => {
    const precoBase = 100;
    const percentualQueda = 10 ;
    const resultado = calcularPrecoAlvo(precoBase, percentualQueda);
    expect(resultado).toBe(90);
});

test('Deve retornar o preço original se a queda percentual for 0',() => {
    const resultado = calcularPrecoAlvo(50, 0);
    expect(resultado).toBe(50)
});

test('Deve lidar com números decimais (EX: R$ 25,50 com 5% de desconto',() => {
    const resultado = calcularPrecoAlvo(25.50, 5);
    expect(resultado).toBeCloseTo(24.225);
});

test('Deve retornar 0 se os inputs não forem números válidos',() => {
    const resultado = calcularPrecoAlvo("texto", 10);
    expect(resultado).toBe(0);
});

});