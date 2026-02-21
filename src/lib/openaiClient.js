const OpenAI = require('openai');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

function isOpenAiEnabled() {
  return Boolean(openai);
}

module.exports = {
  openai,
  isOpenAiEnabled
};
