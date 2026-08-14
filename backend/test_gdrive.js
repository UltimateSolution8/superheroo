const https = require('https');

async function testDriveDownload(fileId) {
  return new Promise((resolve, reject) => {
    const url = 'https://drive.google.com/uc?export=download&id=' + fileId;
    https.get(url, (res) => {
      let data = '';
      const cookies = res.headers['set-cookie'];
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log('--- File ID:', fileId, '---');
        console.log('Status code:', res.statusCode);
        console.log('Location:', res.headers.location);
        console.log('Set-Cookie:', cookies);

        const confirmMatch = data.match(/confirm=([a-zA-Z0-9_-]+)/) || data.match(/name="confirm" value="([^"]+)"/) || data.match(/id="uc-download-link" href="([^"]+)"/);
        if (confirmMatch) {
          console.log('Found match:', confirmMatch[0]);
        } else {
          console.log('No direct match found in HTML body length:', data.length);
        }
        resolve(data);
      });
    }).on('error', reject);
  });
}

testDriveDownload('1TEYxEpOmDviyVOH3W5hZkdKz5_WJYmfN');
