var fs = require('fs');
var d = fs.readFileSync('WorldCLassBCNpunch V1.03ES - Time_Punches.csv', 'utf8');
var lines = d.split('\n').filter(function(l) { return l.trim().length > 0; });
console.log('Total rows: ' + lines.length);
console.log('First line: ' + lines[0].substring(0, 80));
console.log('Last line: ' + lines[lines.length - 1].substring(0, 80));
