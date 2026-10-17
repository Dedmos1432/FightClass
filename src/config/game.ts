export const GAME = {
  title: 'Класс удара',
  version: '0.1.0',
  background: '#10130f',
  storage: {
    session: 'fightclass3.session.v1',
    settings: 'fightclass3.settings.v1',
  },
} as const;

export const SCENES = {
  boot: 'Boot',
  menu: 'MainMenu',
  lobby: 'LobbyEntry',
} as const;
