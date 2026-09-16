"use strict";
(function (root) {
const data = {
  "version": 1,
  "source": {
    "kind": "mock",
    "label": "BirdCut sample interview"
  },
  "language": "en",
  "durationMs": 92000,
  "speakers": [
    {
      "id": "s1",
      "label": "Alex",
      "color": "#7c9cff"
    },
    {
      "id": "s2",
      "label": "Jordan",
      "color": "#6ee7b7"
    }
  ],
  "chapters": [
    {
      "id": "c1",
      "title": "Hook — why the cut feels slow",
      "startMs": 0,
      "endMs": 28000
    },
    {
      "id": "c2",
      "title": "How text-based editing helps",
      "startMs": 28000,
      "endMs": 62000
    },
    {
      "id": "c3",
      "title": "Ship the short",
      "startMs": 62000,
      "endMs": 92000
    }
  ],
  "words": [
    {
      "id": "w1",
      "text": "Okay",
      "startMs": 420,
      "endMs": 780,
      "speakerId": "s1"
    },
    {
      "id": "w2",
      "text": "um",
      "startMs": 840,
      "endMs": 1100,
      "speakerId": "s1"
    },
    {
      "id": "w3",
      "text": "welcome",
      "startMs": 1180,
      "endMs": 1600,
      "speakerId": "s1"
    },
    {
      "id": "w4",
      "text": "back.",
      "startMs": 1660,
      "endMs": 2100,
      "speakerId": "s1"
    },
    {
      "id": "w5",
      "text": "Today",
      "startMs": 3200,
      "endMs": 3540,
      "speakerId": "s1"
    },
    {
      "id": "w6",
      "text": "we",
      "startMs": 3580,
      "endMs": 3720,
      "speakerId": "s1"
    },
    {
      "id": "w7",
      "text": "are",
      "startMs": 3760,
      "endMs": 3900,
      "speakerId": "s1"
    },
    {
      "id": "w8",
      "text": "talking",
      "startMs": 3960,
      "endMs": 4380,
      "speakerId": "s1"
    },
    {
      "id": "w9",
      "text": "about",
      "startMs": 4420,
      "endMs": 4700,
      "speakerId": "s1"
    },
    {
      "id": "w10",
      "text": "cutting",
      "startMs": 4760,
      "endMs": 5180,
      "speakerId": "s1"
    },
    {
      "id": "w11",
      "text": "talking-head",
      "startMs": 5240,
      "endMs": 5900,
      "speakerId": "s1"
    },
    {
      "id": "w12",
      "text": "footage",
      "startMs": 5960,
      "endMs": 6500,
      "speakerId": "s1"
    },
    {
      "id": "w13",
      "text": "faster.",
      "startMs": 6560,
      "endMs": 7100,
      "speakerId": "s1"
    },
    {
      "id": "w14",
      "text": "Wait",
      "startMs": 9000,
      "endMs": 9280,
      "speakerId": "s1"
    },
    {
      "id": "w15",
      "text": "wait",
      "startMs": 9340,
      "endMs": 9600,
      "speakerId": "s1"
    },
    {
      "id": "w16",
      "text": "let",
      "startMs": 9680,
      "endMs": 9860,
      "speakerId": "s1"
    },
    {
      "id": "w17",
      "text": "me",
      "startMs": 9880,
      "endMs": 10000,
      "speakerId": "s1"
    },
    {
      "id": "w18",
      "text": "start",
      "startMs": 10040,
      "endMs": 10380,
      "speakerId": "s1"
    },
    {
      "id": "w19",
      "text": "over.",
      "startMs": 10420,
      "endMs": 10900,
      "speakerId": "s1"
    },
    {
      "id": "w20",
      "text": "Editors",
      "startMs": 12100,
      "endMs": 12640,
      "speakerId": "s1"
    },
    {
      "id": "w21",
      "text": "spend",
      "startMs": 12700,
      "endMs": 13040,
      "speakerId": "s1"
    },
    {
      "id": "w22",
      "text": "hours",
      "startMs": 13100,
      "endMs": 13480,
      "speakerId": "s1"
    },
    {
      "id": "w23",
      "text": "scrubbing",
      "startMs": 13540,
      "endMs": 14100,
      "speakerId": "s1"
    },
    {
      "id": "w24",
      "text": "for",
      "startMs": 14140,
      "endMs": 14300,
      "speakerId": "s1"
    },
    {
      "id": "w25",
      "text": "the",
      "startMs": 14340,
      "endMs": 14480,
      "speakerId": "s1"
    },
    {
      "id": "w26",
      "text": "take",
      "startMs": 14520,
      "endMs": 14820,
      "speakerId": "s1"
    },
    {
      "id": "w27",
      "text": "that",
      "startMs": 14860,
      "endMs": 15040,
      "speakerId": "s1"
    },
    {
      "id": "w28",
      "text": "actually",
      "startMs": 15100,
      "endMs": 15580,
      "speakerId": "s1"
    },
    {
      "id": "w29",
      "text": "lands.",
      "startMs": 15640,
      "endMs": 16200,
      "speakerId": "s1"
    },
    {
      "id": "w30",
      "text": "Yeah",
      "startMs": 18400,
      "endMs": 18740,
      "speakerId": "s2"
    },
    {
      "id": "w31",
      "text": "and",
      "startMs": 18800,
      "endMs": 18980,
      "speakerId": "s2"
    },
    {
      "id": "w32",
      "text": "the",
      "startMs": 19020,
      "endMs": 19140,
      "speakerId": "s2"
    },
    {
      "id": "w33",
      "text": "silence",
      "startMs": 19180,
      "endMs": 19640,
      "speakerId": "s2"
    },
    {
      "id": "w34",
      "text": "between",
      "startMs": 19700,
      "endMs": 20080,
      "speakerId": "s2"
    },
    {
      "id": "w35",
      "text": "thoughts",
      "startMs": 20140,
      "endMs": 20600,
      "speakerId": "s2"
    },
    {
      "id": "w36",
      "text": "eats",
      "startMs": 20660,
      "endMs": 20940,
      "speakerId": "s2"
    },
    {
      "id": "w37",
      "text": "the",
      "startMs": 20980,
      "endMs": 21100,
      "speakerId": "s2"
    },
    {
      "id": "w38",
      "text": "pacing.",
      "startMs": 21140,
      "endMs": 21800,
      "speakerId": "s2"
    },
    {
      "id": "w39",
      "text": "If",
      "startMs": 24100,
      "endMs": 24320,
      "speakerId": "s2"
    },
    {
      "id": "w40",
      "text": "I",
      "startMs": 24360,
      "endMs": 24480,
      "speakerId": "s2"
    },
    {
      "id": "w41",
      "text": "can",
      "startMs": 24520,
      "endMs": 24700,
      "speakerId": "s2"
    },
    {
      "id": "w42",
      "text": "delete",
      "startMs": 24740,
      "endMs": 25140,
      "speakerId": "s2"
    },
    {
      "id": "w43",
      "text": "a",
      "startMs": 25180,
      "endMs": 25280,
      "speakerId": "s2"
    },
    {
      "id": "w44",
      "text": "sentence",
      "startMs": 25320,
      "endMs": 25800,
      "speakerId": "s2"
    },
    {
      "id": "w45",
      "text": "on",
      "startMs": 25840,
      "endMs": 25980,
      "speakerId": "s2"
    },
    {
      "id": "w46",
      "text": "the",
      "startMs": 26020,
      "endMs": 26140,
      "speakerId": "s2"
    },
    {
      "id": "w47",
      "text": "page,",
      "startMs": 26180,
      "endMs": 26740,
      "speakerId": "s2"
    },
    {
      "id": "w48",
      "text": "the",
      "startMs": 26800,
      "endMs": 26940,
      "speakerId": "s2"
    },
    {
      "id": "w49",
      "text": "timeline",
      "startMs": 26980,
      "endMs": 27540,
      "speakerId": "s2"
    },
    {
      "id": "w50",
      "text": "should",
      "startMs": 27580,
      "endMs": 27820,
      "speakerId": "s2"
    },
    {
      "id": "w51",
      "text": "follow.",
      "startMs": 27860,
      "endMs": 28400,
      "speakerId": "s2"
    },
    {
      "id": "w52",
      "text": "So",
      "startMs": 31200,
      "endMs": 31540,
      "speakerId": "s1"
    },
    {
      "id": "w53",
      "text": "BirdCut",
      "startMs": 31620,
      "endMs": 32200,
      "speakerId": "s1"
    },
    {
      "id": "w54",
      "text": "turns",
      "startMs": 32260,
      "endMs": 32580,
      "speakerId": "s1"
    },
    {
      "id": "w55",
      "text": "the",
      "startMs": 32620,
      "endMs": 32740,
      "speakerId": "s1"
    },
    {
      "id": "w56",
      "text": "transcript",
      "startMs": 32780,
      "endMs": 33440,
      "speakerId": "s1"
    },
    {
      "id": "w57",
      "text": "into",
      "startMs": 33500,
      "endMs": 33780,
      "speakerId": "s1"
    },
    {
      "id": "w58",
      "text": "a",
      "startMs": 33820,
      "endMs": 33920,
      "speakerId": "s1"
    },
    {
      "id": "w59",
      "text": "ripple",
      "startMs": 33960,
      "endMs": 34380,
      "speakerId": "s1"
    },
    {
      "id": "w60",
      "text": "cut",
      "startMs": 34420,
      "endMs": 34680,
      "speakerId": "s1"
    },
    {
      "id": "w61",
      "text": "plan.",
      "startMs": 34720,
      "endMs": 35300,
      "speakerId": "s1"
    },
    {
      "id": "w62",
      "text": "You",
      "startMs": 36800,
      "endMs": 37020,
      "speakerId": "s1"
    },
    {
      "id": "w63",
      "text": "know",
      "startMs": 37060,
      "endMs": 37280,
      "speakerId": "s1"
    },
    {
      "id": "w64",
      "text": "you",
      "startMs": 38400,
      "endMs": 38580,
      "speakerId": "s1"
    },
    {
      "id": "w65",
      "text": "mark",
      "startMs": 38620,
      "endMs": 38940,
      "speakerId": "s1"
    },
    {
      "id": "w66",
      "text": "the",
      "startMs": 38980,
      "endMs": 39100,
      "speakerId": "s1"
    },
    {
      "id": "w67",
      "text": "ums,",
      "startMs": 39140,
      "endMs": 39680,
      "speakerId": "s1"
    },
    {
      "id": "w68",
      "text": "drop",
      "startMs": 39740,
      "endMs": 40080,
      "speakerId": "s1"
    },
    {
      "id": "w69",
      "text": "the",
      "startMs": 40120,
      "endMs": 40240,
      "speakerId": "s1"
    },
    {
      "id": "w70",
      "text": "false",
      "startMs": 40280,
      "endMs": 40620,
      "speakerId": "s1"
    },
    {
      "id": "w71",
      "text": "starts,",
      "startMs": 40660,
      "endMs": 41240,
      "speakerId": "s1"
    },
    {
      "id": "w72",
      "text": "and",
      "startMs": 41280,
      "endMs": 41440,
      "speakerId": "s1"
    },
    {
      "id": "w73",
      "text": "keep",
      "startMs": 41480,
      "endMs": 41740,
      "speakerId": "s1"
    },
    {
      "id": "w74",
      "text": "the",
      "startMs": 41780,
      "endMs": 41900,
      "speakerId": "s1"
    },
    {
      "id": "w75",
      "text": "line",
      "startMs": 41940,
      "endMs": 42220,
      "speakerId": "s1"
    },
    {
      "id": "w76",
      "text": "that",
      "startMs": 42260,
      "endMs": 42440,
      "speakerId": "s1"
    },
    {
      "id": "w77",
      "text": "sings.",
      "startMs": 42480,
      "endMs": 43100,
      "speakerId": "s1"
    },
    {
      "id": "w78",
      "text": "I",
      "startMs": 45200,
      "endMs": 45340,
      "speakerId": "s2"
    },
    {
      "id": "w79",
      "text": "mean",
      "startMs": 45380,
      "endMs": 45640,
      "speakerId": "s2"
    },
    {
      "id": "w80",
      "text": "captions",
      "startMs": 46200,
      "endMs": 46780,
      "speakerId": "s2"
    },
    {
      "id": "w81",
      "text": "fall",
      "startMs": 46820,
      "endMs": 47100,
      "speakerId": "s2"
    },
    {
      "id": "w82",
      "text": "out",
      "startMs": 47140,
      "endMs": 47340,
      "speakerId": "s2"
    },
    {
      "id": "w83",
      "text": "of",
      "startMs": 47380,
      "endMs": 47500,
      "speakerId": "s2"
    },
    {
      "id": "w84",
      "text": "the",
      "startMs": 47540,
      "endMs": 47660,
      "speakerId": "s2"
    },
    {
      "id": "w85",
      "text": "same",
      "startMs": 47700,
      "endMs": 47980,
      "speakerId": "s2"
    },
    {
      "id": "w86",
      "text": "words,",
      "startMs": 48020,
      "endMs": 48580,
      "speakerId": "s2"
    },
    {
      "id": "w87",
      "text": "which",
      "startMs": 48640,
      "endMs": 48900,
      "speakerId": "s2"
    },
    {
      "id": "w88",
      "text": "is",
      "startMs": 48940,
      "endMs": 49080,
      "speakerId": "s2"
    },
    {
      "id": "w89",
      "text": "the",
      "startMs": 49120,
      "endMs": 49240,
      "speakerId": "s2"
    },
    {
      "id": "w90",
      "text": "whole",
      "startMs": 49280,
      "endMs": 49540,
      "speakerId": "s2"
    },
    {
      "id": "w91",
      "text": "point.",
      "startMs": 49580,
      "endMs": 50200,
      "speakerId": "s2"
    },
    {
      "id": "w92",
      "text": "Editors",
      "startMs": 52400,
      "endMs": 52920,
      "speakerId": "s2"
    },
    {
      "id": "w93",
      "text": "spend",
      "startMs": 52980,
      "endMs": 53320,
      "speakerId": "s2"
    },
    {
      "id": "w94",
      "text": "hours",
      "startMs": 53380,
      "endMs": 53740,
      "speakerId": "s2"
    },
    {
      "id": "w95",
      "text": "scrubbing",
      "startMs": 53800,
      "endMs": 54360,
      "speakerId": "s2"
    },
    {
      "id": "w96",
      "text": "for",
      "startMs": 54400,
      "endMs": 54560,
      "speakerId": "s2"
    },
    {
      "id": "w97",
      "text": "the",
      "startMs": 54600,
      "endMs": 54740,
      "speakerId": "s2"
    },
    {
      "id": "w98",
      "text": "take",
      "startMs": 54780,
      "endMs": 55080,
      "speakerId": "s2"
    },
    {
      "id": "w99",
      "text": "that",
      "startMs": 55120,
      "endMs": 55300,
      "speakerId": "s2"
    },
    {
      "id": "w100",
      "text": "sings.",
      "startMs": 56800,
      "endMs": 57400,
      "speakerId": "s1"
    },
    {
      "id": "w101",
      "text": "Export",
      "startMs": 63800,
      "endMs": 64280,
      "speakerId": "s1"
    },
    {
      "id": "w102",
      "text": "the",
      "startMs": 64320,
      "endMs": 64440,
      "speakerId": "s1"
    },
    {
      "id": "w103",
      "text": "SRT,",
      "startMs": 64480,
      "endMs": 65020,
      "speakerId": "s1"
    },
    {
      "id": "w104",
      "text": "preview",
      "startMs": 65100,
      "endMs": 65540,
      "speakerId": "s1"
    },
    {
      "id": "w105",
      "text": "the",
      "startMs": 65580,
      "endMs": 65700,
      "speakerId": "s1"
    },
    {
      "id": "w106",
      "text": "diff,",
      "startMs": 65740,
      "endMs": 66200,
      "speakerId": "s1"
    },
    {
      "id": "w107",
      "text": "then",
      "startMs": 66260,
      "endMs": 66480,
      "speakerId": "s1"
    },
    {
      "id": "w108",
      "text": "apply",
      "startMs": 66520,
      "endMs": 66880,
      "speakerId": "s1"
    },
    {
      "id": "w109",
      "text": "it",
      "startMs": 66920,
      "endMs": 67060,
      "speakerId": "s1"
    },
    {
      "id": "w110",
      "text": "to",
      "startMs": 67100,
      "endMs": 67220,
      "speakerId": "s1"
    },
    {
      "id": "w111",
      "text": "the",
      "startMs": 67260,
      "endMs": 67380,
      "speakerId": "s1"
    },
    {
      "id": "w112",
      "text": "sequence.",
      "startMs": 67420,
      "endMs": 68200,
      "speakerId": "s1"
    },
    {
      "id": "w113",
      "text": "Uh",
      "startMs": 70400,
      "endMs": 70740,
      "speakerId": "s2"
    },
    {
      "id": "w114",
      "text": "ship",
      "startMs": 71800,
      "endMs": 72140,
      "speakerId": "s2"
    },
    {
      "id": "w115",
      "text": "the",
      "startMs": 72180,
      "endMs": 72300,
      "speakerId": "s2"
    },
    {
      "id": "w116",
      "text": "short",
      "startMs": 72340,
      "endMs": 72680,
      "speakerId": "s2"
    },
    {
      "id": "w117",
      "text": "before",
      "startMs": 72720,
      "endMs": 73040,
      "speakerId": "s2"
    },
    {
      "id": "w118",
      "text": "the",
      "startMs": 73080,
      "endMs": 73200,
      "speakerId": "s2"
    },
    {
      "id": "w119",
      "text": "algorithm",
      "startMs": 73240,
      "endMs": 73880,
      "speakerId": "s2"
    },
    {
      "id": "w120",
      "text": "moves",
      "startMs": 73940,
      "endMs": 74320,
      "speakerId": "s2"
    },
    {
      "id": "w121",
      "text": "on.",
      "startMs": 74360,
      "endMs": 74800,
      "speakerId": "s2"
    },
    {
      "id": "w122",
      "text": "That's",
      "startMs": 77000,
      "endMs": 77380,
      "speakerId": "s1"
    },
    {
      "id": "w123",
      "text": "the",
      "startMs": 77420,
      "endMs": 77540,
      "speakerId": "s1"
    },
    {
      "id": "w124",
      "text": "edit.",
      "startMs": 77580,
      "endMs": 78140,
      "speakerId": "s1"
    },
    {
      "id": "w125",
      "text": "That's",
      "startMs": 80200,
      "endMs": 80580,
      "speakerId": "s1"
    },
    {
      "id": "w126",
      "text": "the",
      "startMs": 80620,
      "endMs": 80740,
      "speakerId": "s1"
    },
    {
      "id": "w127",
      "text": "edit.",
      "startMs": 80780,
      "endMs": 81340,
      "speakerId": "s1"
    }
  ]
};
if (typeof module !== "undefined" && module.exports) {
  module.exports = data;
}
if (typeof globalThis !== "undefined") {
  globalThis.BirdCutSampleTranscript = data;
}

})(typeof globalThis !== "undefined" ? globalThis : this);
