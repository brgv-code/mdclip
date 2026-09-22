declare module 'turndown-plugin-gfm' {
  import type TurndownService from 'turndown';

  type Plugin = (service: TurndownService) => void;
  const plugins: { gfm: Plugin; tables: Plugin; strikethrough: Plugin; taskListItems: Plugin };
  export default plugins;
}
