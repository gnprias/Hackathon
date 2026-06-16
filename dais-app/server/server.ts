import { createApp, analytics, lakebase, server } from '@databricks/appkit';
import { setupSampleLakebaseRoutes } from './routes/lakebase/todo-routes';
import { setupDeactivationRoutes } from './routes/lakebase/deactivation-routes';
import { setupImrDoctorRoutes } from './routes/lakebase/imr-doctor-routes';
import { setupImrRoutes } from './routes/imr-routes';
import { setupTrustRoutes } from './routes/trust-routes';
import { setupVerificationRoutes } from './routes/verification-routes';
import { setupSearchRoutes } from './routes/search-routes';

createApp({
  plugins: [
    analytics(),
    lakebase(),
    server(),
  ],
  async onPluginsReady(appkit) {
    await setupSampleLakebaseRoutes(appkit);
    await setupDeactivationRoutes(appkit);
    await setupImrDoctorRoutes(appkit);
    appkit.server.extend((app) => {
      setupImrRoutes(app);
      setupTrustRoutes(app);
      setupVerificationRoutes(app);
      setupSearchRoutes(app);
    });
  },
}).catch(console.error);
