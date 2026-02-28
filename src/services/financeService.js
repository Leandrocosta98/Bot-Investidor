/*-----LÓGICA MATEMÁTICA------------*/
const calcularPrecoAlvo = (precoBase, percentualQueda) => {
    if (isNaN(precoBase) || isNaN(percentualQueda)) return 0;
    return precoBase * (1 - (percentualQueda / 100));
};

module.exports = {calcularPrecoAlvo};