export const GAME = {
  title: 'Класс удара',
  version: '0.2.0',
  background: '#10130f',
  storage: {
    session: 'fightclass3.session.v1',
    settings: 'fightclass3.settings.v1',
  },
} as const;

export const SCENES = {
  boot: 'Boot',
  menu: 'MainMenu',
  lobby: 'Lobby',
  gym: 'Gym',
  dojo: 'Dojo',
} as const;
