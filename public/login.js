document.addEventListener('DOMContentLoaded', () => {
    
    const loginForm = document.getElementById('loginForm');

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const senha = document.getElementById('password').value;

            try {
                const response = await fetch('/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, senha })
                });

                const data = await response.json();

                if (response.ok) {
                    alert("✅ Login realizado com sucesso!");
                    window.location.href = "/"; 
                } else {
                    alert("❌ " + (data.erro || "Usuário ou senha inválidos"));
                }
            } catch (error) {
                console.error("Erro:", error);
            }
        });
    }
});