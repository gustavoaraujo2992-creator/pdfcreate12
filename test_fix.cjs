function formatTimeFromISO(val) {
  if (typeof val !== 'string') return val;
  if (val.startsWith('1899-12-30T')) {
    const d = new Date(val);
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  }
  return val;
}

const testCases = [
  "1899-12-30T10:36:28.000Z",
  "1899-12-30T11:06:28.000Z",
  "07:30",
  "random text"
];

testCases.forEach(tc => {
  console.log(`Original: ${tc} -> Normalized: ${formatTimeFromISO(tc)}`);
});
