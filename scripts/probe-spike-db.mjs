import sqlite from 'node-sqlite3-wasm';
const DB = new sqlite.Database('C:/Users/Jonas Ahnstedt/AppData/Roaming/Släktforskning/slaktforskning.db');

// Find "Bengt Gunnar Persson, bytt t Sareld"
const matches = DB.all(`
  SELECT p.id, p.sex, n.given_name, n.surname, n.sort_order, n.is_primary
  FROM persons p
  JOIN person_names n ON n.person_id=p.id
  WHERE n.given_name LIKE '%Bengt%Gunnar%' OR n.surname LIKE '%Sareld%'
  LIMIT 30
`);
for (const m of matches) console.log(m);
DB.close();
