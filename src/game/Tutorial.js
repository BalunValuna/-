import { tr } from '../core/i18n.js';
import { keyLabel } from '../core/input.js';
import { PARTS } from '../car/partsCatalog.js';

/**
 * Step-by-step guide. The garage start teaches assembling the car from the bare shell; the
 * ready start covers the battery, fuel and first drive. Steps check the game state directly, so
 * doing things in another order still advances the guide.
 */
export class Tutorial {
  constructor(game, assembly) {
    this.game = game;
    this.assembly = assembly;
    this.steps = assembly ? this.assemblySteps() : this.readySteps();
    this.i = 0;
    this.done = false;
    this.flags = {};
    this.checkT = 0;
  }

  key(action) {
    return `<span class="k" style="display:inline-block;padding:0 5px;border:1px solid rgba(236,228,214,.35);border-radius:4px;font:600 11px var(--head)">${keyLabel(this.game.input.code(action))}</span>`;
  }

  countInstalled(ids) {
    const car = this.game.car;
    return ids.filter((id) => car.installed(id)).length;
  }

  readySteps() {
    const car = () => this.game.car;
    const E = this.key('interact');
    return [
      {
        title: tr(['Дом', 'Home']),
        text: tr([`Записка лежит у входа в дом. Наведите на неё и нажмите <b>ПКМ</b>, чтобы прочитать, или ${E}, чтобы взять.`, `A note lies by the front door. Look at it and press <b>RMB</b> to read, or ${E} to take it.`]),
        check: () => this.game.stats.notes.includes('home'),
      },
      {
        title: tr(['Аккумулятор', 'Battery']),
        text: tr([
          `Аккумулятор на верстаке в гараже. Откройте капот (наведите на капот, ${E}), затем перетащите аккумулятор, удерживая <b>ЛКМ</b>, к его месту и нажмите ${E}.`,
          `The battery is on the garage workbench. Open the hood (look at it, ${E}), then drag the battery holding <b>LMB</b> to its slot and press ${E}.`,
        ]),
        check: () => car().installed('battery'),
      },
      {
        title: tr(['Топливо', 'Fuel']),
        text: tr([
          `В баке почти пусто. Откройте лючок бензобака на правом заднем крыле, возьмите канистру (${E}) и залейте бензин, удерживая <b>ЛКМ</b> у горловины.`,
          `The tank is nearly empty. Open the fuel flap on the right rear wing, take the jerry can (${E}) and pour, holding <b>LMB</b> at the filler.`,
        ]),
        check: () => car().s.fuel > 12,
      },
      {
        title: tr(['Поехали', "Let's go"]),
        text: tr([
          `Откройте ворота гаража (${E}), сядьте за руль через открытую водительскую дверь и заведите машину: ${this.key('ignition')} — зажигание, повторно удерживайте для запуска стартера.`,
          `Open the garage door (${E}), get behind the wheel through the open driver door and start the engine: ${this.key('ignition')} for ignition, press and hold again to crank.`,
        ]),
        check: () => car().s.running,
      },
      {
        title: tr(['Дорога', 'The road']),
        text: tr([
          `Выезжайте на трассу. ${this.key('headlights')} — фары, ${this.key('journal')} — журнал с состоянием машины и путём. Удачи.`,
          `Get onto the highway. ${this.key('headlights')} — headlights, ${this.key('journal')} — journal with the car's condition and your route. Good luck.`,
        ]),
        check: () => this.game.km() > 0.3,
      },
    ];
  }

  assemblySteps() {
    const car = () => this.game.car;
    const E = this.key('interact');
    const wheels = ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'];
    const bay = ['engine', 'radiator', 'battery', 'airFilter'];
    const body = ['hood', 'trunk', 'frontDoor_L', 'frontDoor_R', 'rearDoor_L', 'rearDoor_R', 'fender_L', 'fender_R', 'frontBumper', 'rearBumper', 'headlight_L', 'headlight_R', 'taillight_L', 'taillight_R', 'windshield', 'rearWindow'];
    const seats = ['seat_FL', 'seat_FR', 'rearSeat'];
    const left = (ids) => ids.filter((id) => !car().installed(id)).map((id) => tr(PARTS[id].name));
    return [
      {
        title: tr(['Голый кузов', 'Bare shell']),
        text: tr([
          `Машину придётся собрать. Сначала возьмите гаечный ключ с верстака: наведите и нажмите ${E}. Мелочь можно убрать в карман — ${this.key('pocket')}.`,
          `You will have to assemble the car. First take the wrench from the workbench: look at it and press ${E}. Small things go into a pocket — ${this.key('pocket')}.`,
        ]),
        check: () => this.game.interaction.hasWrench(),
      },
      {
        title: tr(['Колёса', 'Wheels']),
        text: () =>
          tr([
            `Перетащите колесо к машине, удерживая <b>ЛКМ</b>. У ступицы появится призрачный силуэт — нажмите ${E}, чтобы прикрутить. Осталось: ${4 - this.countInstalled(wheels)}.`,
            `Drag a wheel to the car holding <b>LMB</b>. A ghost appears at the hub — press ${E} to bolt it on. Left: ${4 - this.countInstalled(wheels)}.`,
          ]),
        check: () => this.countInstalled(wheels) === 4,
      },
      {
        title: tr(['Моторный отсек', 'Engine bay']),
        text: () =>
          tr([
            `Двигатель тяжёлый — его можно только тащить. Подведите его к отсеку и установите, затем радиатор, аккумулятор и корпус фильтра. Осталось: ${left(bay).join(', ') || '—'}.`,
            `The engine is heavy — drag it. Bring it to the bay and install it, then the radiator, battery and filter box. Left: ${left(bay).join(', ') || '—'}.`,
          ]),
        check: () => this.countInstalled(bay) === 4,
      },
      {
        title: tr(['Кузов', 'Body']),
        text: () =>
          tr([
            `Капот, двери, крылья, бамперы, фары и стёкла. Мелкие детали можно нести в руках (${E}), крупные — тащить. Осталось ${body.length - this.countInstalled(body)}.`,
            `Hood, doors, fenders, bumpers, lights and glass. Small parts can be carried (${E}), big ones dragged. ${body.length - this.countInstalled(body)} left.`,
          ]),
        check: () => this.countInstalled(body) >= body.length - 2,
      },
      {
        title: tr(['Салон', 'Interior']),
        text: () =>
          tr([
            `Установите сиденья через открытые двери. Без водительского сиденья не поехать. Осталось: ${left(seats).join(', ') || '—'}.`,
            `Fit the seats through the open doors. You can't drive without the driver's seat. Left: ${left(seats).join(', ') || '—'}.`,
          ]),
        check: () => car().installed('seat_FL'),
      },
      {
        title: tr(['Жидкости', 'Fluids']),
        text: () =>
          tr([
            `Откройте капот и залейте масло в горловину на двигателе и антифриз в расширительный бачок (держите канистру в руке, <b>ЛКМ</b> у крышки). Затем бензин в бак. Масло ${car().s.oil.toFixed(1)} л, антифриз ${car().s.coolant.toFixed(1)} л, бензин ${car().s.fuel.toFixed(1)} л.`,
            `Open the hood and pour oil into the engine filler and coolant into the reservoir (hold the can, <b>LMB</b> at the cap). Then petrol into the tank. Oil ${car().s.oil.toFixed(1)} L, coolant ${car().s.coolant.toFixed(1)} L, petrol ${car().s.fuel.toFixed(1)} L.`,
          ]),
        check: () => car().s.oil > 2.5 && car().s.coolant > 3 && car().s.fuel > 4,
      },
      {
        title: tr(['Запуск', 'Start']),
        text: tr([`Сядьте за руль и поверните ключ: ${this.key('ignition')}, затем удерживайте ${this.key('ignition')}, пока двигатель не схватит.`, `Sit behind the wheel and turn the key: ${this.key('ignition')}, then hold ${this.key('ignition')} until the engine catches.`]),
        check: () => car().s.running,
      },
      {
        title: tr(['В путь', 'On the road']),
        text: tr([`Откройте ворота и выезжайте на трассу. ${this.key('journal')} — журнал: там видно, чего не хватает машине.`, `Open the door and get onto the highway. ${this.key('journal')} — the journal shows what the car is still missing.`]),
        check: () => this.game.km() > 0.3,
      },
    ];
  }

  event(name, arg) {
    this.flags[name] = arg ?? true;
  }

  update(dt) {
    if (this.done) return this.game.ui.setTutorial(null);
    this.checkT -= dt;
    if (this.checkT <= 0) {
      this.checkT = 0.3;
      while (this.i < this.steps.length && this.steps[this.i].check()) {
        this.i++;
        this.game.audio?.play('notify', { volume: 0.5 });
      }
      if (this.i >= this.steps.length) {
        this.done = true;
        this.game.ui.setTutorial(null);
        return;
      }
    }
    const s = this.steps[this.i];
    this.game.ui.setTutorial({ title: s.title, text: typeof s.text === 'function' ? s.text() : s.text, index: this.i, total: this.steps.length, foot: tr(['Подсказки можно отключить в настройках', 'Hints can be turned off in the settings']) });
  }

  save() {
    return { i: this.i, done: this.done, assembly: this.assembly };
  }
}
