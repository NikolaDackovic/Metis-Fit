import { gymBusyDto, busySettingsBody } from '@grit/validation';
import { access, defineRoute } from '../../shared/route';
import { createOccupancyService } from './occupancy.service';

const TAG = ['Occupancy'];

export const occupancyRoutes = [
  defineRoute({
    method: 'get',
    path: '/public/occupancy',
    access: access.public,
    summary: 'How busy the gym is: people inside now and the usual number per hour today',
    tags: TAG,
    response: gymBusyDto,
    handler: async ({ deps, res }) => {
      // Private: the answer depends on the X-Club header, shared caches must not mix gyms.
      res.setHeader('Cache-Control', 'private, max-age=60');
      return { data: await createOccupancyService(deps.db).get() };
    },
  }),
  defineRoute({
    method: 'get',
    path: '/admin/busy-settings',
    access: access.can('settings.manage'),
    summary: 'Occupancy settings: shown to members, gym capacity',
    tags: TAG,
    response: busySettingsBody,
    handler: async ({ deps }) => ({ data: await createOccupancyService(deps.db).settings() }),
  }),
  defineRoute({
    method: 'put',
    path: '/admin/busy-settings',
    access: access.can('settings.manage'),
    summary: 'Show or hide occupancy in the member app and set the capacity',
    tags: TAG,
    body: busySettingsBody,
    response: busySettingsBody,
    handler: async ({ actor, req, body, deps }) => ({
      data: await createOccupancyService(deps.db).updateSettings(actor!, req, body),
    }),
  }),
];
