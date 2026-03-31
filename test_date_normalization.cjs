const isoStr = "1899-12-30T10:36:28.000Z";
const d = new Date(isoStr);
console.log('Local Time:', d.toString());
console.log('Hours:', d.getHours(), 'Minutes:', d.getMinutes());
// Expected: 07:30 (approx) if in GMT-3:06:28 zone
