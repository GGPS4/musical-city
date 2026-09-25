import type { RecordLabel } from '../types.js';

/**
 * Real record labels and catalogue artists who released records on them.
 * Facts are kept short and checkable: founding year, city, founders, and
 * well-documented releases. The towers themselves are interpretations.
 */
export const RECORD_LABELS: RecordLabel[] = [
  {
    id: 'motown', name: 'Motown', founded: 1959, city: 'Detroit', founders: 'Berry Gordy',
    blurb: 'Started as Tamla with an $800 family loan and ran like a hit factory from a house Gordy called Hitsville U.S.A.',
    artistIds: ['marvin-gaye', 'stevie-wonder', 'the-supremes', 'the-temptations', 'michael-jackson'], color: '#ffcf5a',
  },
  {
    id: 'stax', name: 'Stax', founded: 1957, city: 'Memphis', founders: 'Jim Stewart and Estelle Axton',
    blurb: 'Began as Satellite Records. Its converted cinema studio gave Southern soul its sound; Otis Redding recorded for its Volt imprint.',
    artistIds: ['otis-redding'], color: '#ff7a3d',
  },
  {
    id: 'atlantic', name: 'Atlantic Records', founded: 1947, city: 'New York', founders: 'Ahmet Ertegun and Herb Abramson',
    blurb: 'Grew from rhythm & blues and jazz into one of the biggest rock labels. Aretha Franklin’s breakthrough came after she signed in 1966.',
    artistIds: ['aretha-franklin', 'john-coltrane', 'led-zeppelin', 'ac-dc'], color: '#e8e8e8',
  },
  {
    id: 'blue-note', name: 'Blue Note', founded: 1939, city: 'New York', founders: 'Alfred Lion and Max Margulis',
    blurb: 'The jazz label behind Francis Wolff’s photos and Reid Miles’s sleeves; Rudy Van Gelder engineered most of its classic sessions.',
    artistIds: ['thelonious-monk', 'miles-davis', 'john-coltrane', 'herbie-hancock'], color: '#3ea0ff',
  },
  {
    id: 'impulse', name: 'Impulse!', founded: 1960, city: 'New York', founders: 'Creed Taylor',
    blurb: 'Orange-and-black gatefold sleeves and the slogan “The New Wave of Jazz Is on Impulse!”. Home of A Love Supreme.',
    artistIds: ['john-coltrane', 'charles-mingus'], color: '#ff8a1f',
  },
  {
    id: 'verve', name: 'Verve', founded: 1956, city: 'Los Angeles', founders: 'Norman Granz',
    blurb: 'Granz founded it largely to record Ella Fitzgerald, whose Song Book series became its best-known work.',
    artistIds: ['ella-fitzgerald', 'billie-holiday'], color: '#6fd1c4',
  },
  {
    id: 'columbia', name: 'Columbia Records', founded: 1889, city: 'New York', founders: 'Columbia Phonograph Company',
    blurb: 'One of the oldest names in recorded music. It released Kind of Blue and Time Out, both in 1959.',
    artistIds: ['miles-davis', 'dave-brubeck', 'aerosmith', 'lauryn-hill', 'beyonce'], color: '#ff4a4a',
  },
  {
    id: 'epic', name: 'Epic Records', founded: 1953, city: 'New York', founders: 'Columbia Records',
    blurb: 'Columbia’s sister label. It released Thriller, the best-selling album of all time.',
    artistIds: ['michael-jackson', 'the-clash', 'rage-against-the-machine'], color: '#ffe066',
  },
  {
    id: 'sire', name: 'Sire Records', founded: 1966, city: 'New York', founders: 'Seymour Stein and Richard Gottehrer',
    blurb: 'Stein signed CBGB bands when nobody else would, then Madonna, and brought British new wave to America.',
    artistIds: ['the-ramones', 'talking-heads', 'madonna', 'the-smiths', 'depeche-mode'], color: '#ff5fa2',
  },
  {
    id: 'elektra', name: 'Elektra', founded: 1950, city: 'New York', founders: 'Jac Holzman',
    blurb: 'Started as a folk label run from a college dorm. It took a chance on The Doors, the MC5 and The Stooges, and later Metallica.',
    artistIds: ['the-doors', 'mc5', 'the-stooges', 'metallica'], color: '#c9b6ff',
  },
  {
    id: 'capitol', name: 'Capitol Records', founded: 1942, city: 'Los Angeles', founders: 'Johnny Mercer, Buddy DeSylva and Glenn Wallichs',
    blurb: 'Its round Hollywood tower looks like a stack of records. The Beach Boys recorded for Capitol throughout the 1960s.',
    artistIds: ['the-beach-boys'], color: '#ffd27a',
  },
  {
    id: 'rca', name: 'RCA Victor', founded: 1901, city: 'New York', founders: 'Eldridge Johnson (Victor Talking Machine Co.)',
    blurb: 'Victor became RCA Victor in 1929. Bowie made Hunky Dory, Ziggy Stardust and his Berlin records for RCA.',
    artistIds: ['david-bowie', 'jefferson-airplane'], color: '#ff6b6b',
  },
  {
    id: 'reprise', name: 'Reprise', founded: 1960, city: 'Los Angeles', founders: 'Frank Sinatra',
    blurb: 'Sinatra’s own label. It released Jimi Hendrix and The Kinks in the United States.',
    artistIds: ['jimi-hendrix', 'the-kinks'], color: '#9bd36a',
  },
  {
    id: 'decca', name: 'Decca', founded: 1929, city: 'London', founders: 'Edward Lewis',
    blurb: 'Famous for turning down The Beatles in 1962, then signing The Rolling Stones in 1963.',
    artistIds: ['the-rolling-stones'], color: '#5ab0ff',
  },
  {
    id: 'parlophone', name: 'Parlophone', founded: 1896, city: 'London', founders: 'Carl Lindström (Germany); George Martin ran it from 1955',
    blurb: 'George Martin signed The Beatles here in 1962. Decades later it released OK Computer and Parklife.',
    artistIds: ['the-beatles', 'radiohead', 'blur'], color: '#e8c35a',
  },
  {
    id: 'apple', name: 'Apple Records', founded: 1968, city: 'London', founders: 'The Beatles',
    blurb: 'The Beatles’ own label. “Hey Jude” was its first single, and its offices sat under the famous rooftop at 3 Savile Row.',
    artistIds: ['the-beatles'], color: '#6fdc6f',
  },
  {
    id: 'harvest', name: 'Harvest', founded: 1969, city: 'London', founders: 'EMI (Malcolm Jones)',
    blurb: 'EMI’s progressive-rock imprint. It released The Dark Side of the Moon in the UK.',
    artistIds: ['pink-floyd'], color: '#c77dff',
  },
  {
    id: 'track', name: 'Track Records', founded: 1966, city: 'London', founders: 'Kit Lambert and Chris Stamp',
    blurb: 'Set up by The Who’s managers. It released The Who and Jimi Hendrix in the UK.',
    artistIds: ['the-who', 'jimi-hendrix'], color: '#ff9f43',
  },
  {
    id: 'vertigo', name: 'Vertigo', founded: 1969, city: 'London', founders: 'Philips Records',
    blurb: 'Its swirling spiral label spun under Black Sabbath’s first albums.',
    artistIds: ['black-sabbath'], color: '#b0b0b0',
  },
  {
    id: 'island', name: 'Island Records', founded: 1959, city: 'Kingston, then London', founders: 'Chris Blackwell',
    blurb: 'Founded in Jamaica. It signed Bob Marley and the Wailers in 1972 and took reggae worldwide, alongside British rock like Roxy Music.',
    artistIds: ['bob-marley', 'toots-and-the-maytals', 'jimmy-cliff', 'burning-spear', 'roxy-music'], color: '#ffd23f',
  },
  {
    id: 'virgin', name: 'Virgin Records', founded: 1972, city: 'London', founders: 'Richard Branson, Simon Draper and Nik Powell',
    blurb: 'Signed the Sex Pistols in 1977 after two other labels dropped them. Later released Daft Punk’s Homework.',
    artistIds: ['sex-pistols', 'daft-punk'], color: '#ff3b3b',
  },
  {
    id: 'polydor', name: 'Polydor', founded: 1913, city: 'Hamburg, later London', founders: 'Deutsche Grammophon',
    blurb: 'Home of The Jam and Siouxsie and the Banshees in the punk era.',
    artistIds: ['the-jam', 'siouxsie-and-the-banshees'], color: '#ff5f5f',
  },
  {
    id: 'chrysalis', name: 'Chrysalis', founded: 1968, city: 'London', founders: 'Chris Wright and Terry Ellis',
    blurb: 'It released Blondie’s Parallel Lines, the album with “Heart of Glass”.',
    artistIds: ['blondie'], color: '#7ee0ff',
  },
  {
    id: 'factory', name: 'Factory Records', founded: 1978, city: 'Manchester', founders: 'Tony Wilson and Alan Erasmus',
    blurb: 'Every release got a FAC catalogue number, even the Haçienda club. Home of Joy Division and New Order.',
    artistIds: ['joy-division', 'new-order'], color: '#f2f2f2',
  },
  {
    id: 'rough-trade', name: 'Rough Trade', founded: 1978, city: 'London', founders: 'Geoff Travis',
    blurb: 'Grew out of a West London record shop. Released The Smiths, and later The Strokes and The Libertines in the UK.',
    artistIds: ['the-smiths', 'the-strokes', 'the-libertines'], color: '#ff7a59',
  },
  {
    id: 'mute', name: 'Mute Records', founded: 1978, city: 'London', founders: 'Daniel Miller',
    blurb: 'Miller started it to release his own synth single, then signed Depeche Mode after seeing them live.',
    artistIds: ['depeche-mode'], color: '#9aa6ff',
  },
  {
    id: 'fiction', name: 'Fiction Records', founded: 1978, city: 'London', founders: 'Chris Parry',
    blurb: 'Parry started it to sign The Cure, who stayed with the label for more than twenty years.',
    artistIds: ['the-cure'], color: '#d0a0ff',
  },
  {
    id: '4ad', name: '4AD', founded: 1980, city: 'London', founders: 'Ivo Watts-Russell and Peter Kent',
    blurb: 'Known for dreamlike sleeves by Vaughan Oliver. Early releases included Bauhaus; later came Pixies.',
    artistIds: ['bauhaus', 'pixies'], color: '#e6e6e6',
  },
  {
    id: 'creation', name: 'Creation Records', founded: 1983, city: 'London', founders: 'Alan McGee',
    blurb: 'McGee saw Oasis at a Glasgow gig in 1993 and signed them.',
    artistIds: ['oasis'], color: '#6ad1ff',
  },
  {
    id: '2-tone', name: '2 Tone Records', founded: 1979, city: 'Coventry', founders: 'Jerry Dammers',
    blurb: 'Black-and-white checks and a mission of racial unity. It launched the ska revival.',
    artistIds: ['the-specials'], color: '#f5f5f5',
  },
  {
    id: 'bronze', name: 'Bronze Records', founded: 1971, city: 'London', founders: 'Gerry Bron',
    blurb: 'It released Motörhead’s Overkill and Ace of Spades.',
    artistIds: ['motorhead'], color: '#d49a5a',
  },
  {
    id: 'domino', name: 'Domino', founded: 1993, city: 'London', founders: 'Laurence Bell and Jacqui Rice',
    blurb: 'Arctic Monkeys’ debut on Domino became the fastest-selling debut album in UK chart history at the time.',
    artistIds: ['arctic-monkeys', 'franz-ferdinand'], color: '#ffb347',
  },
  {
    id: 'matador', name: 'Matador', founded: 1989, city: 'New York', founders: 'Chris Lombardi',
    blurb: 'A pillar of American indie. It released Slanted and Enchanted and Turn On the Bright Lights.',
    artistIds: ['pavement', 'interpol'], color: '#ff5e5e',
  },
  {
    id: 'dfa', name: 'DFA Records', founded: 2001, city: 'New York', founders: 'James Murphy, Tim Goldsworthy and Jonathan Galkin',
    blurb: 'Dance-punk from a downtown studio. Home of LCD Soundsystem.',
    artistIds: ['lcd-soundsystem'], color: '#f0f0f0',
  },
  {
    id: 'sub-pop', name: 'Sub Pop', founded: 1986, city: 'Seattle', founders: 'Bruce Pavitt, joined by Jonathan Poneman',
    blurb: 'Branded the grunge sound. It put out Nirvana’s Bleach and Soundgarden’s first EPs.',
    artistIds: ['nirvana', 'soundgarden'], color: '#ffe14d',
  },
  {
    id: 'geffen', name: 'Geffen / DGC', founded: 1980, city: 'Los Angeles', founders: 'David Geffen',
    blurb: 'It released Appetite for Destruction, and through its DGC imprint, Nevermind and Sonic Youth’s Goo.',
    artistIds: ['guns-n-roses', 'nirvana', 'sonic-youth'], color: '#8fd3ff',
  },
  {
    id: 'sst', name: 'SST Records', founded: 1978, city: 'Long Beach, California', founders: 'Greg Ginn',
    blurb: 'Black Flag’s guitarist started it to release his band, and it became a hub for American underground rock.',
    artistIds: ['black-flag', 'sonic-youth'], color: '#ff6a3d',
  },
  {
    id: 'dischord', name: 'Dischord', founded: 1980, city: 'Washington, D.C.', founders: 'Ian MacKaye and Jeff Nelson',
    blurb: 'Fiercely independent, with cheap records and all-ages shows. Home of Minor Threat and Fugazi.',
    artistIds: ['minor-threat', 'fugazi'], color: '#e0e0e0',
  },
  {
    id: 'epitaph', name: 'Epitaph', founded: 1980, city: 'Los Angeles', founders: 'Brett Gurewitz',
    blurb: 'Bad Religion’s guitarist started it. The Offspring’s Smash became one of the best-selling independent albums ever.',
    artistIds: ['bad-religion', 'the-offspring', 'rancid'], color: '#ff4d6d',
  },
  {
    id: 'alternative-tentacles', name: 'Alternative Tentacles', founded: 1979, city: 'San Francisco', founders: 'Jello Biafra and East Bay Ray',
    blurb: 'The Dead Kennedys’ own label, a home for politically sharp punk.',
    artistIds: ['dead-kennedys'], color: '#7cff6b',
  },
  {
    id: 'megaforce', name: 'Megaforce', founded: 1982, city: 'New Jersey', founders: 'Jon and Marsha Zazula',
    blurb: 'The Zazulas ran a record store and started the label to release Metallica’s Kill ’Em All.',
    artistIds: ['metallica'], color: '#c0c0c0',
  },
  {
    id: 'metal-blade', name: 'Metal Blade', founded: 1982, city: 'Los Angeles', founders: 'Brian Slagel',
    blurb: 'Started with the Metal Massacre compilations. It released Slayer’s debut, Show No Mercy.',
    artistIds: ['slayer'], color: '#ff3030',
  },
  {
    id: 'def-jam', name: 'Def Jam', founded: 1984, city: 'New York', founders: 'Rick Rubin and Russell Simmons',
    blurb: 'Started in Rubin’s NYU dorm room. LL Cool J’s “I Need a Beat” was its first release; Jay-Z and Kanye West came through Roc-A-Fella.',
    artistIds: ['ll-cool-j', 'beastie-boys', 'public-enemy', 'jay-z', 'kanye-west'], color: '#f5f5f5',
  },
  {
    id: 'sugar-hill', name: 'Sugar Hill Records', founded: 1979, city: 'Englewood, New Jersey', founders: 'Sylvia and Joe Robinson',
    blurb: 'Put rap on record with “Rapper’s Delight”, then released “The Message”.',
    artistIds: ['grandmaster-flash'], color: '#ff9ecb',
  },
  {
    id: 'profile', name: 'Profile Records', founded: 1981, city: 'New York', founders: 'Cory Robbins and Steve Plotnicki',
    blurb: 'Released every Run-DMC album of the 1980s, including Raising Hell.',
    artistIds: ['run-dmc'], color: '#ff5050',
  },
  {
    id: 'tommy-boy', name: 'Tommy Boy', founded: 1981, city: 'New York', founders: 'Tom Silverman',
    blurb: 'It released 3 Feet High and Rising.',
    artistIds: ['de-la-soul'], color: '#ffd84d',
  },
  {
    id: 'jive', name: 'Jive Records', founded: 1981, city: 'London and New York', founders: 'Clive Calder',
    blurb: 'Home of A Tribe Called Quest from People’s Instinctive Travels to The Love Movement.',
    artistIds: ['a-tribe-called-quest'], color: '#7affc1',
  },
  {
    id: 'ruthless', name: 'Ruthless Records', founded: 1987, city: 'Compton', founders: 'Eazy-E and Jerry Heller',
    blurb: 'Released Straight Outta Compton.',
    artistIds: ['nwa'], color: '#ffffff',
  },
  {
    id: 'death-row', name: 'Death Row', founded: 1991, city: 'Los Angeles', founders: 'Dr. Dre, Suge Knight, The D.O.C. and Dick Griffey',
    blurb: 'Defined G-funk with The Chronic and released 2Pac’s All Eyez on Me.',
    artistIds: ['dr-dre', '2pac'], color: '#b5b5b5',
  },
  {
    id: 'bad-boy', name: 'Bad Boy Records', founded: 1993, city: 'New York', founders: 'Sean Combs',
    blurb: 'Released Ready to Die, The Notorious B.I.G.’s debut.',
    artistIds: ['the-notorious-big'], color: '#ffd23f',
  },
  {
    id: 'loud', name: 'Loud Records', founded: 1991, city: 'New York', founders: 'Steve Rifkind',
    blurb: 'Signed Wu-Tang Clan as a group while letting each member sign solo deals elsewhere.',
    artistIds: ['wu-tang-clan'], color: '#ffcc00',
  },
  {
    id: 'laface', name: 'LaFace Records', founded: 1989, city: 'Atlanta', founders: 'L.A. Reid and Babyface',
    blurb: 'Put Atlanta on the map, releasing OutKast from Southernplayalisticadillacmuzik onwards.',
    artistIds: ['outkast'], color: '#ff8fd0',
  },
  {
    id: 'aftermath', name: 'Aftermath', founded: 1996, city: 'Los Angeles', founders: 'Dr. Dre',
    blurb: 'Dre’s label after Death Row. It signed Eminem in 1998 and later co-released Kendrick Lamar.',
    artistIds: ['dr-dre', 'eminem', 'kendrick-lamar'], color: '#e0e0e0',
  },
  {
    id: 'stones-throw', name: 'Stones Throw', founded: 1996, city: 'Los Angeles', founders: 'Peanut Butter Wolf',
    blurb: 'Released Madvillainy, MF DOOM’s album with Madlib as Madvillain.',
    artistIds: ['mf-doom'], color: '#ff7043',
  },
  {
    id: 'curtom', name: 'Curtom', founded: 1968, city: 'Chicago', founders: 'Curtis Mayfield and Eddie Thomas',
    blurb: 'Mayfield’s own label. It released Super Fly.',
    artistIds: ['curtis-mayfield'], color: '#ffb000',
  },
  {
    id: 'paisley-park', name: 'Paisley Park Records', founded: 1985, city: 'Minneapolis', founders: 'Prince',
    blurb: 'Prince’s label, named after his song and, later, his studio complex.',
    artistIds: ['prince'], color: '#b36bff',
  },
];

export const LABEL_BY_ID: Record<string, RecordLabel> = Object.fromEntries(RECORD_LABELS.map((l) => [l.id, l]));

/** Labels an artist released records on. */
export function labelsFor(artistId: string): RecordLabel[] {
  return RECORD_LABELS.filter((l) => l.artistIds.includes(artistId));
}
