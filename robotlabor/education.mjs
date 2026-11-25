import { Vector3 } from './vendor/three.mjs';
import { gravity } from './core.mjs';

export const robotLessons = {
    articulated: {
        properties: 'Hat forgó csuklóból álló soros robotkar. Az első három tengely főként a helyzetet, az utolsó három főként a szerszám irányát állítja. Általános, nem szinguláris helyzetben hat független pózösszetevő vezérelhető.',
        workspace: 'Szabálytalan, gömbhéjszerű tartomány: az alap forgása körbeforgatja a váll és könyök által bejárható területet. A karok hossza szabja meg a kinyúlást, a csuklóhatárok és a talaj levágnak belőle. A belső üres részeket nem feltétlenül éri el a megfogó.',
        experiment: 'Tartsd azonos helyen a vállat, és hajlítsd be a könyököt. Figyeld, hogyan változik a váll nyomatéka a tömegek vízszintes erőkarjával együtt.',
    },
    scara: {
        properties: 'R–R–P–R lánc, négy szabadságfokkal. Két függőleges forgástengely mozgat a vízszintes síkban, egy szán emel vagy süllyeszt, az utolsó tengely a szerszám irányát állítja. Nem képes tetszőleges térbeli billentésre.',
        workspace: 'Gyűrűs hengerszelethez hasonló: a két kar a vízszintes síkban gyűrűs tartományt jár be, a Z-szán ennek magasságot ad. A korlátozott váll- és könyökszögek miatt nem teljes henger. Az utolsó, nem nulla hosszúságú tag szerszámforgatása a TCP helyzetét is módosíthatja.',
        experiment: 'Hasonlítsd össze az R1 és a P3 terhelését. A függőleges forgástengely gravitációs nyomatéka nulla lehet, de a függőleges szánnak tartania kell a felette mozgatott tömeget.',
    },
    cartesian: {
        properties: 'Három egymásra merőleges lineáris szán: X, Y és Z. Három helyzeti szabadságfok, állandó szerszámorientáció. Egyetlen szán mozgatása csak egy világkoordinátát változtat.',
        workspace: 'Téglatest, mert három független intervallum Descartes-szorzata: X × Y × Z. Ebben a modellben X: −400…400 mm, Y: −300…300 mm, Z: 100…950 mm. A drótváz a tengelyhatárok burkolója, a pontok az ütközésvizsgálattal elfogadott állásokat jelölik.',
        experiment: 'Mozgasd csak az X-szánt: Y és Z nem változik. A vízszintes szán gravitációs tartóereje nulla, de gyorsításhoz a mozgó tömeg miatt erő szükséges.',
    },
    cylindrical: {
        properties: 'Egy alapforgás, egy függőleges és egy sugárirányú lineáris szán: R–P–P. Három csuklókoordináta adja a helyzetet; a szerszám orientációja nem függetlenül állítható.',
        workspace: 'Hengerhéjszerű tartomány: a sugárirányú szán egy szakaszt jár be, az alapforgás ezt körbeforgatja, az emelőszán pedig magasságot ad. A rögzített karhossz miatt belső üreg is lehet.',
        experiment: 'Növeld a sugárirányú kinyúlást. Az alap függőleges tengelyének gravitációs nyomatéka ettől még nulla maradhat, a forgatás effektív tehetetlensége viszont nő.',
    },
    polar: {
        properties: 'Két forgó és egy teleszkópos csukló: R–R–P. Az alap az irányt, a billentés az emelkedést, a szán a távolságot állítja. A végpont három helyzeti koordinátával vezérelhető.',
        workspace: 'Gömbhéjszelet: a teleszkóp a sugarat változtatja, a két forgás pedig két szögirányt ad. A billentés korlátai, a talaj és az akadályok miatt nem teljes gömb.',
        experiment: 'Ugyanakkora teherrel növeld a teleszkóp hosszát. A billentő csukló nagyobb erőkart kap, ezért általában nő a szükséges tartónyomaték.',
    },
    lift: {
        properties: 'Egyetlen függőleges lineáris csukló, egy szabadságfokkal. Csak a magasság változik; a vízszintes helyzet és a szerszám orientációja kötött.',
        workspace: 'Függőleges szakasz, nem térfogat. Egyetlen független koordináta csak egydimenziós végpontpályát ad. A pontok a megfogó középpontját mutatják, nem a robot teljes söpört térfogatát.',
        experiment: 'Álló helyzetben növeld a terhet 1 kg-mal: a szükséges tartóerő 9,81 N-nal nő. Egyenletes magasságváltozás önmagában nem jelent gyorsítási erőt.',
    },
    cobot: {
        properties: 'Hét forgó csuklós, redundáns soros kar. A konfiguráció hét szabadságfokú, de a végpont póza legfeljebb hat. A többletcsukló több karhelyzetet tehet lehetővé ugyanahhoz a pózhoz. A hét tengely önmagában nem tesz egy robotot biztonságosan együttműködővé.',
        workspace: 'A hajlítható karok és csavaró tengelyek összetett, héjszerű térbeli tartományt adnak. A redundancia elsősorban az ugyanahhoz a végpontpózhoz tartozó karhelyzetek számát növeli, nem egy hetedik térbeli irányt hoz létre.',
        experiment: 'Hasonlítsd össze a hét csuklókoordinátát a TCP három helyzet- és három orientációértékével. Miért nem lesz a végpontnak hét független térbeli összetevője?',
    },
    delta: {
        properties: 'Három, 120°-ban elhelyezett motor forgatja a rövid felső karokat. A platformot három párhuzamos, két végén csuklós rúd köti a karvégekhez. A három motor együtt mozgatja a könnyű végplatformot; a szerszám orientációja közel állandó.',
        workspace: 'Lekerekített, közel hengeres munkatér. A végplatform helyét a három alsó rúd állandó hossza és a három motorállás együtt határozza meg. A munkatér széle a karok geometriájából és a motorhatárokból adódik.',
        experiment: 'Mozgasd külön az egyik motort: a platform oldalra és függőlegesen is elmozdul. Ezután azonos mértékben állítsd át mindhárom motort, és figyeld a szimmetrikus függőleges mozgást.',
    },
    custom: {
        properties: 'Saját, nyitott soros lánc. Minden független R vagy P csukló egy konfigurációs szabadságfokot ad. A végpont tényleges mozgásképességét a tengelyirányok, a taghosszak és a pillanatnyi geometria határozza meg.',
        workspace: 'A forma az összes helyi tengely, merev tag, mozgáshatár és ütközési feltétel együttese. Azonos csuklószám sem garantál azonos alakot vagy térfogatot. Párhuzamos szánok például nem adnak három független térbeli irányt.',
        experiment: 'Változtass meg egy helyi tengelyirányt, majd hasonlítsd össze a munkateret. A csuklók száma változatlan maradhat, miközben a végpont mozgása lényegesen megváltozik.',
    },
};

export function jointRole(model, index, joint) {
    const roles = {
        articulated: ['Alapforgás: a kar vízszintes irányát állítja.', 'Váll: emeli és süllyeszti a teljes további kart.', 'Könyök: hajlítja a kart, módosítja a kinyúlást.', 'Csuklófordítás: a szerszámoldali tagokat csavarja.', 'Csuklóbillentés: a szerszám dőlését állítja.', 'Szerszámforgás: a megfogót saját tengelye körül forgatja.'],
        scara: ['Vállforgás: a vízszintes munkaterület irányát állítja.', 'Könyökforgás: a síkbeli kinyúlást módosítja.', 'Függőleges szán: a megfogó magasságát állítja.', 'Szerszámforgás: a munkadarab síkbeli irányát állítja.'],
        cartesian: ['X-híd: a teljes további szánszerkezetet X irányba viszi.', 'Y-kocsi: a függőleges szánt Y irányba viszi.', 'Z-szán: a szerszámot lefelé vagy felfelé mozgatja.'],
        cylindrical: ['Alapforgás: a sugárirányú kar irányát állítja.', 'Emelőszán: a kar magasságát állítja.', 'Sugárszán: a tengelytől mért távolságot változtatja.'],
        polar: ['Alapforgás: a teleszkópos kar vízszintes irányát állítja.', 'Billentés: a kar emelkedési szögét állítja.', 'Teleszkóp: a kinyúlást változtatja.'],
        lift: ['Emelőszán: a végpont magasságát változtatja.'],
        cobot: ['Alapforgás: az egész kar irányát állítja.', 'Váll: a felkart és a további tagokat emeli.', 'Felkarcsavarás: a további csuklók síkját fordítja el.', 'Könyök: a kinyúlást és a kar hajlítását változtatja.', 'Alkarcsavarás: a csuklószerkezet irányát fordítja el.', 'Csuklóbillentés: a szerszám dőlését változtatja.', 'Szerszámforgás: a megfogó saját tengely körüli irányát állítja.'],
        delta: ['1. motor: a felső kart a saját tangenciális tengelye körül forgatja.', '2. motor: a második felső kart forgatja; a két alsó rúd közös platformhelyzetet kényszerít ki.', '3. motor: a harmadik felső kart forgatja; mindhárom kar együtt határozza meg a platformot.'],
    };
    return roles[model]?.[index] || `${joint.type === 'R' ? 'Forgó' : 'Lineáris'} csukló: a lánc utána következő összes tagját mozgatja a helyi ${joint.axis} tengely ${joint.type === 'R' ? 'körül' : 'mentén'}.`;
}

export function explainJoint(joints, result, payload, index) {
    const joint = joints[index];
    const frame = result.frames[index];
    const bodies = result.frames.slice(index).map((body, offset) => ({ name: `${index + offset + 1}. tag`, mass: joints[index + offset].mass, position: body.center }));
    bodies.push({ name: 'Végponti teher', mass: payload, position: result.tip });
    const contributions = bodies.map(body => {
        const arm = body.position.clone().sub(frame.origin);
        const lever = arm.clone().cross(new Vector3(0, 0, 1)).dot(frame.axis);
        const projection = joint.type === 'R' ? lever : frame.axis.z;
        return { ...body, lever, projection, weight: body.mass * gravity, holding: body.mass * gravity * projection };
    });
    const load = result.loads[index];
    const nearZero = Math.abs(load.holding) < 0.005;
    const vertical = Math.abs(frame.axis.z) > 0.999;
    let reason;
    if (joint.type === 'R') {
        reason = nearZero
            ? vertical ? 'A forgástengely függőleges, a súlyerők is függőlegesek: nincs a tengely körül forgató gravitációs komponens. Ettől még gyorsításhoz nyomaték kellhet.' : 'A súlyerők tengelyre vetített nyomatékai most közel nullára adódnak: kicsi az erőkar, vagy az előjeles hozzájárulások kiegyenlítik egymást. Gyorsításhoz ettől még kellhet nyomaték.'
            : 'A csukló utáni tagok és a teher súlya erőkarral hat a tengelyre. Nem csak a kiválasztott tag tömege számít: minden utána következő tömeg hozzájárul. A tengelyre vetített erőkar változásával a nyomaték is változik.';
    } else {
        reason = nearZero ? 'A szán tengelye vízszintes: a súlynak nincs tengelyirányú összetevője. Az idealizált modellben ezért nulla a gravitációs tartóerő; a gyorsításhoz és a valós súrlódás legyőzéséhez ettől még erő szükséges.' : 'A mozgatott tagok és a végponti teher súlyának tengelyirányú összetevőjét a lineáris hajtás tartja. Függőleges szánnál ez a teljes mozgatott súly.';
    }
    return { contributions, reason, supportedMass: contributions.reduce((sum, body) => sum + body.mass, 0), ratio: Math.abs(load.total) / joint.limit };
}