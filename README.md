# robotics

# Robotlabor

Az egységes oktatási alkalmazás belépési pontja a gyökérmappában található index.html. Az eredeti robot.html, robot2.html és robot-programming-simulator fájljait nem módosítja.

## Indítás

Node.js 18 vagy újabb verzióval, a gyökérmappából:

```sh
node robotlabor/server.cjs
```

Cím: http://127.0.0.1:4173. Másik port PowerShellből: `$env:PORT=4174`, majd az indítóparancs. Live Serverrel is használható. Az ES-modulok miatt a közvetlen file:// megnyitás nem támogatott.

Nincs telepítési lépés vagy külső hálózati kérés: a Three.js 0.170.0, OrbitControls és Lucide 0.468.0 helyi példánya a vendor mappában található. A harmadik fél könyvtárainak licencei külön fájlokban találhatók.

## Funkciók

- Egyetlen, folyamatos 3D-munkatér; forgatás, nagyítás, alapnézet, felül- és elölnézet, teljes képernyő.
- Nyolc robotkonfiguráció: 6R kar, SCARA, kartéziánus, hengerkoordinátás, poláris, emelő, 7R redundáns kar és külön kinematikájú, hárommotoros Delta párhuzamos robot.
- 1–12 csuklós robotépítő: R/P típus, helyi tengely, tagirány, hossz, tömeg, mozgáshatárok és nyomaték-/erőhatár; csuklók sorrendje módosítható.
- Csuklóra vagy jelölésre kattintva helyi csúszka. Szögek fokban, eltolódások mm-ben; számítás belső SI-egységekben.
- Ütközésszűrt munkatér (legfeljebb 2400 szabad állás), szabadságfokok, TCP-koordináták és orientáció.
- Kartéziánus portál négy lábbal, X-híddal, Y-kocsival és lefelé mozgó Z-szánnal. A tengelyhatárok téglateste külön látható.
- Opcionális Bosch-profil vázas, plexifalas robotcella; a falak a kézi mozgatást és a pályalejátszást is határolják.
- Az Artikulált robotnál a 3D-nézetből kapcsolható két magasított konvejor és a köztük átrakható, 80 mm-es munkadarab; a célkonvejorra helyezés visszajelzést ad.
- Kézi pontbeállítás, memóriába mentés, pontfrissítés, visszaállás, törlés, időzítés, lejátszás, szünet és idővonal.
- A munkamenet nem használ localStorage/sessionStorage tárolást. Frissítéskor a robot, a terhelés és a pályapontok alaphelyzetbe állnak.

## Számítási modell

A geometria és a számítás közös térbeli transzformációs láncból származik. Az alap 180 mm magas, a SCARA oszlopa 650 mm. A portál vezetősíkja 1100 mm magas. A merev tagok tömege a geometriai középpontban koncentrált. A végponti teher a TCP-ben van. A pozitív Z felfelé mutat.

A portál TCP-tartománya X: -400..400 mm, Y: -300..300 mm, Z: 100..950 mm. A három szán egymásra merőleges, az orientáció állandó és lefelé mutat. A Z negatív koordinátája a felső vezetősíkhoz viszonyított lefelé eltolás. A portál csak három merőleges P-tengelyű konfigurációként érvényes; más lánc építéséhez robotkar-kiindulás szükséges.

A gravitációs tartónyomaték a csukló utáni összes tag és a teher erőnyomatékának helyi tengelyre vetített összege. A lineáris csuklónál a súly tengelyirányú vetülete számít. A hajtáshatárt az előjeles tartóerő vagy nyomaték abszolút értékével hasonlítjuk össze.

A dinamikai modell közelítő, független csuklós tömegpontmodell: a gravitációhoz az effektív tehetetlenség és szöggyorsulás, illetve mozgatott tömeg és gyorsulás szorzatát adja. Nem tartalmaz csuklók közötti dinamikai csatolást, saját középponti tagtehetetlenséget, Coriolis- vagy centrifugális hatást, súrlódást, hajtóműveket vagy dinamikai ütközésfeloldást. A mozgási energia is ezzel az egyszerűsített modellel becsült. Nem használható valódi gép biztonsági méretezésére.

## Munkacella és munkatér

A robot mozgását 1 foknál, illetve 5 mm-nél nem nagyobb csuklólépésekben vizsgáljuk. A rudak, szánok és megfogó bővített szakaszokkal közelítettek. Talaj-, talapzat- vagy aktív cellafal-érintéskor az utolsó szabad állásnál megáll a kézi mozgatás és a pálya. A hordozott kockát befoglaló gömb közelíti. Nincs teljes önütközés- vagy folytonos elérhetőségi vizsgálat.

A Cella átlátszó plexi oldalfalakat és tetőpanelt, valamint Bosch-profil vázat jelenít meg, a két konvejor számára kialakított átvezető nyílással. A falak és a tető a robot mozgását határolják. A központi robotgép és a zárt alsó házú konvejorok közös, 380 mm magas gyártósori szinten találkoznak.

A munkatér csak a fenti közelítéssel elfogadott csuklóállások végpontjait tartalmazza. Nem gyártói munkatéradat és nem bizonyítja az ütközésmentes megközelíthetőséget. A portál drótvázas téglateste a tengelyhatárok burkolója.

A munkadarab az A konvejor X irányú szalagján indul (középpont: X = -840, Y = 0 mm), a rá merőleges B konvejor Y irányú szalagja a lerakási cél (X = 0, Y = -840 mm). Az átrakófeladat csak az Artikulált robotnál érhető el; mindkét zárt konvejorház a robot központi géptestéhez csatlakozik, és a cella falán kialakított nyíláson át belóg a védett térbe. A konvejorok és a darab egyetlen, a 3D-nézetben lévő kapcsolóval ki- és bekapcsolhatók; a feladat újbóli bekapcsolásakor a darab az A oldalra áll vissza. Megfogási távolság: 90 mm. Megfogáskor a darab a TCP-hez rögzül, tömege hozzáadódik a végponti teherhez. A B konvejor fölötti elengedést a felület sikeres átrakásként jelzi. A konvejorok álló oktatási elemek, nincs automatikus anyagmozgatás.

A pálya csuklótérben ötödfokú interpoláció: `s(u)=10u^3-15u^4+6u^5`. Minden tárolt pontban nulla sebesség és gyorsulás van. A TCP útvonala általában nem egyenes. A szakaszidő a ponttól a következő pontig értendő. A pontok és a robotgeometria együtt érvényesek; geometriaváltáskor a program megerősítés után törli a pályát.

A Delta robot külön párhuzamos modellként szerepel: három motorállásból a három rögzített hosszúságú alsó rúd gömbmetszésével számoljuk a platform helyét. A hajtásterhelés csak közelítő statikai oktatási becslés; a rudak teljes dinamikai csatolását nem tartalmazza. Az új robotépítő továbbra is nyitott soros láncokra érvényes.

## Oktatási magyarázatok

A 3D-csukló vagy jelölése fölé vitt egér, illetve a jelölés billentyűzetes fókusza megmutatja a csukló típusát, feladatát, helyi tengelyét, taghosszát, tömegét, mozgáshatárait és az aktuális terhelés okát. Kattintáskor vagy mobilos érintéskor a csúszka nyílik meg, a részletes magyarázat pedig a Csukló közelről részben marad elérhető. Az Escape bezárja a lebegő ismertetőt.

A robot és a munkatere rész minden mintarobothoz külön elmagyarázza a lánc felépítését, a szabadságfokok jelentését és a munkatér alakját. Megfigyelési feladat segíti a csúszkákkal végzett kísérletezést. A részletek összecsukhatók.

A Számítás fül a kiválasztott csukló gravitációs terhelését tagonként és végponti teherként vezeti le, ugyanabból a térbeli állapotból, mint a számítás. A magyarázat kitér az előjeles erőkarra vagy tengelyvetületre, a gyorsítási hozzájárulásra, a nulla gravitációs terhelés jelentésére, az SI-egységekre, a transzformációs mátrixra, az energiára, a sebességre és az ötödfokú pályainterpolációra. Az oktatási modell korlátai külön szerepelnek.

## Tesztek

```sh
node --test robotlabor/core.test.mjs robotlabor/education.test.mjs
```

A tesztek kiterjednek a csuklótranszformációkra, karhossz- és tömegfüggő nyomatékra, lineáris hajtóerőre, a helyzeti energia deriváltjával való egyezésre, az interpoláció végfeltételeire, a portál koordinátáira és talajközeli felvételi helyzetére, az összes kezdőállásra, az ütközési megállásra és a talaj feletti munkatér-mintavételre.
