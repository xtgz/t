const { TonClient, WalletContractV4, internal } = require("@ton/ton");
const { mnemonicToPrivateKey } = require("@ton/crypto");
const https = require('https');

const fs = require('fs');
const path = require('path');


// Maximum number of attempts
const maxTimes = 10000;

async function main(mnemonic, index) {

  // Create Client
  const client = new TonClient({
    endpoint: "https://toncenter.com/api/v2/jsonRPC",
  });

  const mnemonics = mnemonic.split(' ');
  let keyPair = await mnemonicToPrivateKey(mnemonics);
  let workchain = 0;
  let wallet = WalletContractV4.create({
    workchain,
    publicKey: keyPair.publicKey,
  });

  try {
    let contract = client.open(wallet);
    console.log(`${wallet.address} started running`);
    let balance = await contract.getBalance();
    console.log(`Wallet ${index}: [${wallet.address}], balance: ${balance}`);
    
    if (balance == 0) {
      console.log(`Wallet ${index}: [${wallet.address}], balance is 0. Retrying in 3 minutes.`);
      await sleep(180000);
      throw new Error('Balance is 0');
    }

    let v = [];

    for (let i = 0; i < 4; i++) {
      v.push(
        internal({
          to: "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c",
          to: wallet.address,
          value: '0',
          body: 'data:application/json,{"p":"ton-20","op":"mint","tick":"nano","amt":"100000000000"}'
        })
      );
    }
    
    let count = 0;
    let seqno = -1;
    let lastSuccess = true
    let lastSeqno = -1
    let lastError = ''

    for (let i = 0; i < maxTimes; i++) {
      try {
        seqno = await contract.getSeqno();
        let transfer = await contract.sendTransfer({
          seqno: seqno,
          secretKey: keyPair.secretKey,
          validUntil: Math.floor(Date.now() / 1e3) + 600,
          messages: v,
        });
        count++;
        if (seqno > lastSeqno) {
          console.log(`Wallet ${index}: [${wallet.address}], ${count}th successful transaction, seqno: ${seqno}, resp: ${transfer}, current time: ${new Date().toLocaleString()}`);
        } else {
          console.log(`Wallet ${index}: [${wallet.address}], ${count}th transaction sent, seqno: ${seqno}, resp: ${transfer}, current time: ${new Date().toLocaleString()}`);
        }
        lastSeqno = seqno
        lastSuccess = true
      } catch (error) {
        lastSuccess = false
        console.log(`Wallet ${index}: [${wallet.address}], error: ${error.response.data.code}, ${error.response.data.error}`);
        if (error.response.data.code === undefined) {
          console.log(`error.response.data.code === undefined, ${error.response.status}, ${error.response.statusText}`);
        }
      }
    }
  } catch (err) {
    console.log('create client error', err.response && err.response.data ? err.response.data.code : err.response, err.response && err.response.data ? err.response.data.error : '', err);
    console.log(`Retrying wallet ${index}`);
    main(mnemonic, index);
  }
}

const sleep = (time) => {
  return new Promise((resolve) => setTimeout(resolve, time));
}

const getPhrase = () => {
  try {
    const phrases = fs.readFileSync(path.join(__dirname, './phrases.txt'), 'utf-8');
    return phrases.split('\n');
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.log('phrases.txt file not found, creating the file automatically')
      fs.writeFileSync(path.join(__dirname, './phrases.txt'), '');
    } else {
      console.log(error);
    }
    return [];
  }
}

const mnemonicList = getPhrase().map(t => t ? t.trim() : '').filter(t => t && t.indexOf('#') == -1 && (t.split(' ').length === 12 || t.split(' ').length === 24));

if (mnemonicList.length === 0) {
  console.error(`
    ******************************************************
    No valid wallet mnemonics found. Please fill in the phrases.txt file in the current directory.
    It requires 12 or 24 word mnemonics, one per line.
    You can add comments by starting a line with '#'. Here's an example:
    # This is a comment for my wallet
    word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12 word13 word14 word15 word16 word17 word18 word19 word20 word21 word22 word23 word24
    ******************************************************`)
  return
} else {
  console.log(`Found{mnemonicList.length}mnemonics in this run`)
}

const checkStatus = (addr) => {
  // get请求 https://api.ton.cat/v2/contracts/address/EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c，返回的json数据中meta.is_suspended为true时，合约被冻结
  const url = `https://api.ton.cat/v2/contracts/address/${addr}`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      res.on('data', (d) => {
        const data = JSON.parse(d);
        // console.log(data);
        if (data.meta.is_suspended) {
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  });
}

mnemonicList.forEach((t, index) => {
  main(t, index + 1);
});

/*
const run = () => {
  checkStatus('EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c').then(
    (res) => {
      if (res) {
      } else {
        const waitTime = 10;
        console.log(
          `合约被冻结，等待${waitTime}秒后重试，当前时间：`,
          new Date().toLocaleString()
        );
        setTimeout(() => {
          run();
        }, waitTime * 1000);
      }
    }
  );
};

run();
*/
