const { ethers } = require('ethers');

// Shared ERC20 utilities used by worker and on-demand scanner
const TRANSFER_TOPIC = ethers.id('Transfer(address,address,uint256)');

function decodeTransferLog(log) {
  const iface = new ethers.Interface([
    'event Transfer(address indexed from,address indexed to,uint256 value)'
  ]);
  const { from, to, value } = iface.decodeEventLog('Transfer', log.data, log.topics);
  return { from: from.toLowerCase(), to: to.toLowerCase(), value };
}

module.exports = { TRANSFER_TOPIC, decodeTransferLog };
