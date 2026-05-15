import { zipSync } from 'fflate';
import fs from 'node:fs';

const GED = `0 HEAD
1 GEDC
2 VERS 5.5.1
1 SOUR Genney
0 @I1@ INDI
1 NAME Anna /Andersson/
1 SEX F
0 @I2@ INDI
1 NAME Bo /Bengtsson/
1 SEX M
0 @I3@ INDI
1 NAME Cecilia /Andersson/
1 SEX F
0 @F1@ FAM
1 HUSB @I2@
1 WIFE @I1@
1 CHIL @I3@
0 TRLR
`;

const zipped = zipSync({
  'export.ged': new TextEncoder().encode(GED),
});
const out = process.argv[2];
fs.writeFileSync(out, zipped);
console.log('wrote', out, zipped.length, 'bytes');
