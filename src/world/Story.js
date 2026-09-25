import { tr } from '../core/i18n.js';

/**
 * Notes found along the road. Letters from the sister arrive in order as the journey goes on;
 * the rest are traces of other people. `noteFor` decides what a spawned note says.
 */
export const NOTES = {
  home: {
    title: ['Записка на столе', 'Note on the table'],
    text: [
      'Ключи от машины в замке зажигания. Аккумулятор я снял, чтобы не сел — он на верстаке в гараже, там же ключ на 13 и канистра с бензином.\n\nВозьми воды, сколько унесёшь. По трассе на запад, до самого моря. Не останавливайся в темноте.\n\n— Папа',
      'The car keys are in the ignition. I took the battery out so it wouldn\'t go flat — it\'s on the workbench in the garage, with the wrench and a can of petrol.\n\nTake as much water as you can carry. West along the highway, all the way to the sea. Don\'t stop in the dark.\n\n— Dad',
    ],
  },
  sister1: {
    title: ['Письмо от Ани', 'Letter from Anya'],
    text: [
      'Если ты это читаешь — значит, едешь. Я оставляю письма там, где останавливаюсь. На побережье, говорят, есть свет и вода. В Прибрежном ждут всех, кто доедет.\n\nНе бросай машину. Без неё тут никак.',
      'If you are reading this, you are on your way. I leave letters wherever I stop. They say there is power and water on the coast. Pribrezhny waits for everyone who makes it.\n\nDon\'t abandon the car. There is no way without it.',
    ],
  },
  sister2: {
    title: ['Письмо от Ани', 'Letter from Anya'],
    text: [
      'Третий день пути. Ночью у дороги кто-то ходит. Я не выключала фары до утра и держала двери запертыми. Заправки пустые, но в домах иногда находится еда.\n\nКанистру держи полной. Всегда.',
      'Day three. Something walks by the road at night. I kept the headlights on until morning and the doors locked. The stations are empty, but houses sometimes have food.\n\nKeep the can full. Always.',
    ],
  },
  sister3: {
    title: ['Письмо от Ани', 'Letter from Anya'],
    text: [
      'Машина закипела посреди пустыни. Хорошо, что в багажнике был антифриз. Смотри на стрелку температуры — у отцовской машины радиатор старый.\n\nЯ почти на середине пути.',
      'The car boiled over in the middle of the desert. Good thing there was coolant in the trunk. Watch the temperature needle — the radiator in Dad\'s car is old.\n\nI am almost halfway.',
    ],
  },
  sister4: {
    title: ['Письмо от Ани', 'Letter from Anya'],
    text: [
      'Видела блокпост. Военные ушли давно, но оставили ящики. Там же предупреждение про мины — обходи поле по дороге, не срезай.\n\nПо радио на 89.3 всё ещё играет музыка. Значит, кто-то жив.',
      'Saw a checkpoint. The soldiers are long gone but left crates behind. There was a warning about mines — go around by the road, don\'t cut across.\n\nThere is still music on 89.3. Someone is alive.',
    ],
  },
  sister5: {
    title: ['Письмо от Ани', 'Letter from Anya'],
    text: [
      'Я чувствую запах моря. Или мне кажется. Осталось совсем немного. Если доедешь раньше меня — жди у маяка.',
      'I can smell the sea. Or I think I can. Not far now. If you get there before me, wait at the lighthouse.',
    ],
  },
  lore1: {
    title: ['Вырезка из газеты', 'Newspaper clipping'],
    text: [
      '«…связь с прибрежными районами прервана третьи сутки. Власти просят граждан не покидать дома и не выезжать на трассу М-9 в тёмное время суток…»',
      '"...contact with the coastal districts has been lost for the third day. The authorities urge citizens to stay at home and avoid the M-9 highway after dark..."',
    ],
  },
  lore2: {
    title: ['Список', 'A list'],
    text: ['Вода — 6 бутылок\nТушёнка\nСвечи\nАккумулятор проверить!!\nЗапаска\nНЕ ЕХАТЬ НОЧЬЮ', 'Water — 6 bottles\nCanned stew\nCandles\nCheck the battery!!\nSpare wheel\nDO NOT DRIVE AT NIGHT'],
  },
  lore3: {
    title: ['Записка механика', "Mechanic's note"],
    text: [
      'Кто возьмёт мою машину — не жалей её. Масло меняй, радиатор не трогай горячим. Колесо снимается ключом на 17, аккумулятор — руками. Удачи.',
      'Whoever takes my car — don\'t spare it. Change the oil, don\'t open a hot radiator. The wheel comes off with a 17 wrench, the battery by hand. Good luck.',
    ],
  },
  lore4: {
    title: ['Детский рисунок', "A child's drawing"],
    text: ['Дом, солнце, машина, море. Подпись кривыми буквами: «МЫ ЕДЕМ К БАБУШКЕ».', 'A house, a sun, a car, the sea. Scrawled underneath: "WE ARE GOING TO GRANDMA\'S".'],
  },
  lore5: {
    title: ['Дневник', 'Diary page'],
    text: [
      'Они не любят свет. Когда я включил фонарь, оно отошло. Кролики — это не шутка, они правда бросаются. Держу монтировку у двери.',
      'They don\'t like light. When I turned on the torch it backed away. The rabbits are no joke, they really do attack. I keep a crowbar by the door.',
    ],
  },
  lore6: {
    title: ['Объявление', 'Notice'],
    text: ['ЗАПРАВКА РАБОТАЕТ ЗА НАЛИЧНЫЕ\nколонка 2 — дизель\nвода во дворе, кран у стены', 'FUEL FOR CASH ONLY\npump 2 — diesel\nwater in the yard, tap by the wall'],
  },
  lore7: {
    title: ['Открытка', 'Postcard'],
    text: ['«Привет из Прибрежного! Море тёплое, погода отличная. Приезжайте все!» Штамп: май 2012.', '"Greetings from Pribrezhny! The sea is warm and the weather is great. Come, all of you!" Postmark: May 2012.'],
  },
};

const SISTER = ['sister1', 'sister2', 'sister3', 'sister4', 'sister5'];
const LORE = ['lore1', 'lore2', 'lore3', 'lore4', 'lore5', 'lore6', 'lore7'];

export class Story {
  constructor(game) {
    this.game = game;
  }

  /** Note id for a note spawned at a POI loot spot. Sister letters appear in order by distance. */
  noteFor(d, idx, rng) {
    const km = Math.max(0, d.z / 1000);
    const letter = Math.min(SISTER.length - 1, Math.floor(km / 900));
    if (rng.chance(0.4) && d.k > 3) return SISTER[letter];
    return rng.pick(LORE);
  }

  title(id) {
    return tr(NOTES[id]?.title || ['Записка', 'Note']);
  }

  text(id) {
    return tr(NOTES[id]?.text || ['…', '…']);
  }
}
