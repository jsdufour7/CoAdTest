export {
  createClient,
  getClient,
  listClients,
  countClients,
  type ListClientsOptions,
} from "./clients/client.service";
export {
  CLIENT_LINK_TYPE_LABELS,
  CLIENT_LINK_TYPES,
  createClientLink,
  deleteClientLink,
  listClientLinks,
  type ClientLinkRow,
  type ClientLinkTypeValue,
} from "./links/link.service";
export { addFamilyMember } from "./family/family.service";
export { addNote } from "./notes/note.service";
export { addTask, setTaskStatus } from "./tasks/task.service";
export { addTimelineEntry, listTimeline } from "./timeline/timeline.service";
export {
  addFamilyMemberSchema,
  addNoteSchema,
  addTaskSchema,
  clientSearchSchema,
  createClientSchema,
} from "./schemas";
export type { CrmActor } from "./actor";
