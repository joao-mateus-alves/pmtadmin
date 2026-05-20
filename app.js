import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getDatabase,
  ref,
  push,
  onValue
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyC58ES7uRIfO8Cf6etnZ54H6aGTHJAG1Uw",
  authDomain: "mypmtadmin-16308.firebaseapp.com",
  databaseURL: "https://mypmtadmin-16308-default-rtdb.firebaseio.com",
  projectId: "mypmtadmin-16308",
  storageBucket: "mypmtadmin-16308.firebasestorage.app",
  messagingSenderId: "74155713812",
  appId: "1:74155713812:web:7a560cbd6847b1a7700e01"
};

const app = initializeApp(firebaseConfig);

const db = getDatabase(app);



// ================= VEÍCULOS =================

if (document.getElementById("listaVeiculos")) {

  const veiculosRef = ref(db, "veiculos");

  window.salvarVeiculo = async () => {

    await push(veiculosRef, {
      unidade: unidade.value,
      viatura: viatura.value,
      placa: placa.value,
      modelo: modelo.value,
      odometro: odometro.value,
      combustivel: combustivel.value,
      status: statusViatura.value
    });

  };

  onValue(veiculosRef, (snapshot) => {

    listaVeiculos.innerHTML = "";

    snapshot.forEach((item) => {

      const dados = item.val();

      listaVeiculos.innerHTML += `
        <li>
          ${dados.viatura} - ${dados.placa}
          <br>
          ${dados.status}
        </li>
      `;
    });

  });

}



// ================= CONDUTORES =================

if (document.getElementById("listaCondutores")) {

  const condutoresRef = ref(db, "condutores");

  window.salvarCondutor = async () => {

    await push(condutoresRef, {
      cargo: cargo.value,
      nome: nome.value,
      telefone: telefone.value,
      situacao: situacao.value
    });

  };

  onValue(condutoresRef, (snapshot) => {

    listaCondutores.innerHTML = "";

    snapshot.forEach((item) => {

      const dados = item.val();

      listaCondutores.innerHTML += `
        <li>
          ${dados.nome}
          <br>
          ${dados.cargo} - ${dados.situacao}
        </li>
      `;
    });

  });

}



// ================= ORDEM DE SERVIÇO =================

if (document.getElementById("listaOS")) {

  const osRef = ref(db, "ordens_servico");

  window.salvarOS = async () => {

    await push(osRef, {
      ficha: ficha.value,
      saida: saida.value,
      retorno: retorno.value,
      natureza: natureza.value,
      itinerario: itinerario.value,
      local: local.value,
      oficial: oficial.value,
      chefe: chefe.value
    });

  };

  onValue(osRef, (snapshot) => {

    listaOS.innerHTML = "";

    snapshot.forEach((item) => {

      const dados = item.val();

      listaOS.innerHTML += `
        <li>
          Ficha: ${dados.ficha}
          <br>
          ${dados.natureza}
        </li>
      `;
    });

  });

}



// ================= MANUTENÇÃO =================

if (document.getElementById("listaManutencao")) {

  const manutencaoRef = ref(db, "manutencao");

  window.salvarManutencao = async () => {

    await push(manutencaoRef, {
      veiculo: veiculoManutencao.value,
      tipo: tipoManutencao.value,
      entrada: entrada.value,
      saida: saidaManutencao.value
    });

  };

  onValue(manutencaoRef, (snapshot) => {

    listaManutencao.innerHTML = "";

    snapshot.forEach((item) => {

      const dados = item.val();

      listaManutencao.innerHTML += `
        <li>
          ${dados.veiculo}
          <br>
          ${dados.tipo}
        </li>
      `;
    });

  });

}