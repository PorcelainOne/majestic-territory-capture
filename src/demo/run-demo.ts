import { runDemo } from './scenario.js';

try {
  runDemo((stage, tick, zones) => {
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
  });
  console.log('\nВсе проверки демо пройдены.');
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
