const { getPublicConfig } = require('../config/publicConfig');

function getPublic(req, res) {
  return res.json(getPublicConfig());
}

module.exports = {
  getPublic
};
