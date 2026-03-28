let currentData = {
  equipe: [],
  setores: new Set(),
  datas: new Set(),
  totalPages: 0,
  rawTexts: [],
};

function getState() {
  return currentData;
}

function setState(newState) {
  currentData = newState;
}

function resetState() {
  currentData = {
    equipe: [],
    setores: new Set(),
    datas: new Set(),
    totalPages: 0,
    rawTexts: [],
  };
}

export default {
  getState,
  setState,
  resetState,
};
