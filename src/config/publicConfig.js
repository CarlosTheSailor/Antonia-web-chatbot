const publicConfig = {
  language: 'es',
  funnel: {
    askOneQuestionPerTurn: true,
    handoffMode: 'human_whatsapp'
  },
  lead: {
    requiredFields: ['contact'],
    optionalFields: ['name', 'goal', 'availability', 'experienceLevel', 'notes']
  },
  stages: ['welcome', 'discover', 'recommend', 'close']
};

function getPublicConfig() {
  return publicConfig;
}

module.exports = {
  getPublicConfig
};
