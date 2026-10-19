import { runDemo } from './scenario.js';

try {
  runDemo((stage, tick, zones, scores) => {
    console.log(`\n${stage} — тик ${tick}`);
    console.table(
      zones.map(
        ({ id, ownerId, progress, capturingFactionId, isContested }) => ({
          id,
          ownerId,
          progress,
          capturingFactionId,
          isContested,
        }),
      ),
    );
    console.log('Балансы фракций:');
    console.table(
      Object.entries(scores).map(([factionId, balance]) => ({
        factionId,
        balance,
      })),
    );
  });
  console.log('\nВсе проверки демо пройдены.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
