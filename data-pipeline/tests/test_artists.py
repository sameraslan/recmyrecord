import pytest

from rmr_pipeline.artists import clean_artist

# Every artist string in the feature table that clean_artist changes, with the value it must return.
# A rule change that alters any of these, or changes any other string, fails
# test_changes_on_the_feature_table_are_exactly_the_reviewed_ones.
EXPECTED_TABLE_CHANGES = {
    ' Zappa':
        'Zappa',
    'Ali Farka Touré With Ry CooderAli Farka TouréRy Cooder':
        'Ali Farka Touré With Ry Cooder',
    'Berlin Philharmonic Orchestra / Herbert von KarajanBerliner PhilharmonikerHerbert von Karajan':
        'Berlin Philharmonic Orchestra / Herbert von Karajan',
    'Billie Holiday & Ray Ellis and His OrchestraBillie HolidayRay Ellis':
        'Billie Holiday & Ray Ellis and His Orchestra',
    'Bob Marley & The WailersBob MarleyThe Wailers':
        'Bob Marley & The Wailers',
    'Bruce Springsteen & the E Street BandBruce SpringsteenE Street Band':
        'Bruce Springsteen & the E Street Band',
    'Chick Corea and Return to ForeverChick CoreaReturn to Forever':
        'Chick Corea and Return to Forever',
    'Cliff Jordan and John GilmoreClifford JordanJohn Gilmore':
        'Cliff Jordan and John Gilmore',
    'Clint Mansell Featuring Kronos QuartetClint MansellKronos Quartet':
        'Clint Mansell Featuring Kronos Quartet',
    'Count Basie and His OrchestraCount BasieCount Basie Orchestra':
        'Count Basie and His Orchestra',
    'Cult of Luna and Julie ChristmasCult of LunaJulie Christmas':
        'Cult of Luna and Julie Christmas',
    'David Kauffman and Eric CaboorDavid KauffmanEric Caboor':
        'David Kauffman and Eric Caboor',
    'Duke Ellington / Charlie Mingus / Max RoachDuke EllingtonCharles MingusMax Roach':
        'Duke Ellington / Charlie Mingus / Max Roach',
    'Elzhi With Will SessionsElzhiWill Sessions':
        'Elzhi With Will Sessions',
    'Estonian Philharmonic Chamber Choir / Paul HillierEesti Filharmoonia KammerkoorPaul Hillier':
        'Estonian Philharmonic Chamber Choir / Paul Hillier',
    'Estonian Philharmonic Chamber Choir / Tallinn Chamber Orchestra / Tõnu KaljusteEesti Filharmoonia KammerkoorTallinna KammerorkesterTõnu Kaljuste':
        'Estonian Philharmonic Chamber Choir / Tallinn Chamber Orchestra / Tõnu Kaljuste',
    "Fela & The Africa 70Fela KutiThe Africa '70":
        'Fela & The Africa 70',
    "Fela and The Africa 70Fela KutiThe Africa '70":
        'Fela and The Africa 70',
    'Fela Anikulapo Kuti & Egypt 80Fela KutiEgypt 80':
        'Fela Anikulapo Kuti & Egypt 80',
    "Fela Anikulapo Kuti & His Africa '70Fela KutiThe Africa '70":
        "Fela Anikulapo Kuti & His Africa '70",
    "Fela Anikulapo Kuti and Afrika 70Fela KutiThe Africa '70":
        'Fela Anikulapo Kuti and Afrika 70',
    "Fela Anikulapo Kuti and the Afrika 70Fela KutiThe Africa '70":
        'Fela Anikulapo Kuti and the Afrika 70',
    "Fela Aníkúlápó Kuti and Afrika 70Fela KutiThe Africa '70":
        'Fela Aníkúlápó Kuti and Afrika 70',
    "Fela Ransome Kuti & Africa 70Fela KutiThe Africa '70":
        'Fela Ransome Kuti & Africa 70',
    "Fela Ransome Kuti & The Afrika 70Fela KutiThe Africa '70":
        'Fela Ransome Kuti & The Afrika 70',
    'Floating Points, Pharoah Sanders & The London Symphony OrchestraFloating PointsPharoah SandersLondon Symphony Orchestra':
        'Floating Points, Pharoah Sanders & The London Symphony Orchestra',
    'Frank Sinatra, Count Basie and His OrchestraFrank SinatraCount BasieCount Basie Orchestra':
        'Frank Sinatra, Count Basie and His Orchestra',
    'Frank Zappa and The Mothers of InventionFrank ZappaThe Mothers of Invention':
        'Frank Zappa and The Mothers of Invention',
    "Fred Wesley and the J.B.'sFred WesleyThe J.B.'s":
        "Fred Wesley and the J.B.'s",
    "Fẹla and Afrika 70Fela KutiThe Africa '70":
        'Fẹla and Afrika 70',
    'Getatchew Mekuria & The Ex & Guestsጌታቸው መኩሪያ [Gétatchèw Mèkurya]The Ex':
        'Getatchew Mekuria & The Ex & Guests',
    'Hailu Mergia & Dahlak Bandኃይሉ መርጊያ [Hailu Mergia]ዳህካክ ባኀድ [Dahlak Band]':
        'Hailu Mergia & Dahlak Band',
    'Harold Budd / Brian Eno with Daniel LanoisHarold BuddBrian Eno':
        'Harold Budd / Brian Eno with Daniel Lanois',
    'Harold Budd / Brian EnoHarold BuddBrian Eno':
        'Harold Budd / Brian Eno',
    'Howard Shore, Ornette Coleman & The London Philharmonic OrchestraHoward ShoreOrnette ColemanLondon Philharmonic Orchestra':
        'Howard Shore, Ornette Coleman & The London Philharmonic Orchestra',
    'Janis Joplin With Big Brother and The Holding CompanyJanis JoplinBig Brother & The Holding Company':
        'Janis Joplin With Big Brother and The Holding Company',
    'John Coltrane and Johnny HartmanJohn ColtraneJohnny Hartman':
        'John Coltrane and Johnny Hartman',
    "John Mayall and The BluesbreakersJohn MayallJohn Mayall's Bluesbreakers":
        'John Mayall and The Bluesbreakers',
    "John Mayall With Eric ClaptonJohn MayallEric ClaptonJohn Mayall's Bluesbreakers":
        'John Mayall With Eric Clapton',
    'Kaz Bałagane x Bel MondoKaz BałaganeBelmondawg':
        'Kaz Bałagane x Bel Mondo',
    'Kirov Orchestra / Valery GergievСимфонический оркестр Мариинского театра [Mariinsky Orchestra]Валерий Гергиев [Valery Gergiev]':
        'Kirov Orchestra / Valery Gergiev',
    'Lula Côrtes e Zé RamalhoLula CôrtesZé Ramalho':
        'Lula Côrtes e Zé Ramalho',
    'Matthew Halsall & The Gondwana OrchestraMatthew HalsallGondwana Orchestra':
        'Matthew Halsall & The Gondwana Orchestra',
    'Mike Bloomfield / Al Kooper / Steve StillsMike BloomfieldAl KooperSteve Stills':
        'Mike Bloomfield / Al Kooper / Steve Stills',
    'Morente & Lagartija NickEnrique MorenteLagartija Nick':
        'Morente & Lagartija Nick',
    'Pastor T.L. Barrett and the Youth for Christ ChoirPastor T.L. BarrettThe Youth for Christ Choir':
        'Pastor T.L. Barrett and the Youth for Christ Choir',
    'Polish National Radio Symphony Orchestra (Katowice) / Antoni WitNarodowa Orkiestra Symfoniczna Polskiego Radia w KatowicachAntoni Wit':
        'Polish National Radio Symphony Orchestra (Katowice) / Antoni Wit',
    'RCA Victor Symphony Orchestra / Kirill Kondrashin / Van CliburnRCA Victor Symphony OrchestraКирилл Кондрашин [Kirill Kondrashin]Van Cliburn':
        'RCA Victor Symphony Orchestra / Kirill Kondrashin / Van Cliburn',
    'Robert Pollard With Doug GillardRobert PollardDoug Gillard':
        'Robert Pollard With Doug Gillard',
    'Roy Haynes, Phineas Newborn, Paul ChambersRoy HaynesPhineas Newborn Jr.Paul Chambers':
        'Roy Haynes, Phineas Newborn, Paul Chambers',
    'Royal Concertgebouw Orchestra / Asko Ensemble / Riccardo ChaillyConcertgebouworkestAsko EnsembleRiccardo Chailly':
        'Royal Concertgebouw Orchestra / Asko Ensemble / Riccardo Chailly',
    'Ry Cooder & V.M. BhattRy CooderVishwa Mohan Bhatt':
        'Ry Cooder & V.M. Bhatt',
    'The Dillinger Escape Plan with Mike PattonThe Dillinger Escape PlanMike Patton':
        'The Dillinger Escape Plan with Mike Patton',
    'The Horace Silver Quintet Plus J. J. JohnsonHorace SilverJ.J. Johnson':
        'The Horace Silver Quintet Plus J. J. Johnson',
    'The Mahavishnu Orchestra With John McLaughlinMahavishnu OrchestraJohn McLaughlin':
        'The Mahavishnu Orchestra With John McLaughlin',
    'Toumani Diabaté With Ballaké SissokoToumani DiabatéBallaké Sissoko':
        'Toumani Diabaté With Ballaké Sissoko',
    'Westside Gunn & ConwayWestside GunnConway the Machine':
        'Westside Gunn & Conway',
    'Wynton Kelly Trio / Wes MontgomeryWynton KellyWes Montgomery':
        'Wynton Kelly Trio / Wes Montgomery',
    'Zappa / MothersFrank ZappaThe Mothers of Invention':
        'Zappa / Mothers',
    'Zbigniew Wodecki with Mitch & Mitch Orchestra and ChoirZbigniew WodeckiMitch & Mitch':
        'Zbigniew Wodecki with Mitch & Mitch Orchestra and Choir',
}

LEGITIMATE = [
    "OutKast", "McCoy Tyner", "Paul McCartney & Wings", "Les McCann & Eddie Harris", "DeBarge", "LaBelle",
    "Iris DeMent", "Keith Jarrett, Gary Peacock & Jack DeJohnette", "Shakti With John McLaughlin",
    "Martin O'Donnell & Michael Salvatori", "Sinéad O'Connor", "The O'Jays", "D'Angelo and The Vanguard",
    "Pete Rock & InI", "Pete Rock & C.L. Smooth", "Kool G. Rap & D.J. Polo", "Nat 'King' Cole and His Trio",
    "Isengrind / TwinSisterMoon / Natural Snow Buildings", "AC/DC", "MGMT", "deadmau5", "will.i.am", "2Pac",
    "PRO8L3M", "Ecco2K", "SpaceGhostPurrp", "CunninLynguists", "mewithoutYou", "diSEMBOWELMENT", "dEUS",
    "The Notorious B.I.G.", "Anderson .Paak", "...And You Will Know Us by the Trail of Dead", "Van Morrison",
    "Earth, Wind & Fire", "Crosby, Stills, Nash & Young", "Simon & Garfunkel", "АукцЫон [Auktyon]",
    "АукцЫон [Auktyon], Marc Ribot, John Medeski, Ned Rothenberg, Frank London & Владимир Волков [Vladimir Volkov]",
    "Замай [Zamay] & Слава КПСС [Slava KPSS]", "青葉市子 [Ichiko Aoba]", "Fẹla and Afrika 70",
]


def test_known_example():
    assert clean_artist("Bruce Springsteen & the E Street BandBruce SpringsteenE Street Band") == \
        "Bruce Springsteen & the E Street Band"


def test_tail_in_another_script():
    assert clean_artist("Hailu Mergia & Dahlak Bandኃይሉ መርጊያ [Hailu Mergia]ዳህካክ ባኀድ [Dahlak Band]") == \
        "Hailu Mergia & Dahlak Band"


@pytest.mark.parametrize("name", LEGITIMATE)
def test_legitimate_names_are_unchanged(name):
    assert clean_artist(name) == name


def test_glued_names_that_do_not_repeat_the_credit_are_left_alone():
    # Two different artists glued together cannot be split safely without another source.
    assert clean_artist("Foo & The BarsBaz Quartet") == "Foo & The BarsBaz Quartet"
    assert clean_artist("Artist AArtist B") == "Artist AArtist B"


def test_a_single_name_is_never_split():
    # No joiner in the credit, so a repeated word alone is not enough.
    assert clean_artist("Duran Duran") == "Duran Duran"
    assert clean_artist("SpaceGhoztPurrpSpaceGhozt") == "SpaceGhoztPurrpSpaceGhozt"


def test_whitespace_is_normalised():
    assert clean_artist(" Zappa") == "Zappa"
    assert clean_artist("Simon  &\tGarfunkel \n") == "Simon & Garfunkel"
    assert clean_artist("  Bob Marley & The WailersBob MarleyThe Wailers ") == "Bob Marley & The Wailers"


@pytest.mark.parametrize("raw", [*EXPECTED_TABLE_CHANGES, *LEGITIMATE, "Foo & The BarsBaz Quartet", ""])
def test_idempotent(raw):
    once = clean_artist(raw)
    assert clean_artist(once) == once


def test_changes_on_the_feature_table_are_exactly_the_reviewed_ones(table):
    artists = sorted(set(table["Artist"].astype(str)))
    changed = {a: clean_artist(a) for a in artists if clean_artist(a) != a}
    assert changed == EXPECTED_TABLE_CHANGES


def test_expected_values_are_prefixes_of_the_raw_strings():
    # Guards the table above against typos: every fix only drops the glued tail (and outer whitespace).
    for raw, clean in EXPECTED_TABLE_CHANGES.items():
        assert raw.strip().startswith(clean) and len(clean) < len(raw)
