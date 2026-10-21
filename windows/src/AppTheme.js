// Windows counterpart of Sources/PalmierPro/UI/AppTheme.swift.
export const AppTheme = {
  Background: { base: '#0a0a0a', surface: '#161616', raised: '#1e1e1e', prominent: '#2c2c2c', preview: '#000000' },
  Border: { primary: 'rgba(255,255,255,.16)', subtle: 'rgba(255,255,255,.12)', divider: 'rgba(255,255,255,.44)' },
  BorderWidth: { hairline: '.5px', thin: '1px', medium: '1.5px', thick: '2px' },
  Accent: { timecode: '#f29933', primary: '#f5efe4', spotlight: '#ff4545' },
  Text: { primary: '#ffffff', secondary: 'rgba(255,255,255,.80)', tertiary: 'rgba(255,255,255,.62)', muted: 'rgba(255,255,255,.34)' },
  Status: { error: '#e54f4f', success: '#4fb85f' },
  TrackColor: { video: '#0091c2', audio: '#58a822', image: '#b72dd2', selected: 'rgba(245,239,228,.14)' },
  Spacing: { xxs: '2px', xs: '4px', sm: '6px', smMd: '8px', md: '10px', mdLg: '12px', lg: '14px', lgXl: '16px', xl: '20px', xlXxl: '24px', xxl: '28px' },
  FontSize: { micro: '8px', xxs: '9px', xs: '10px', sm: '11px', smMd: '12px', md: '13px', mdLg: '14px', lg: '15px', xl: '18px', title1: '22px', title2: '28px', display: '36px' },
  FontWeight: { regular: 400, medium: 500, semibold: 600, bold: 700 },
  Radius: { xs: '3px', xsSm: '4px', sm: '6px', md: '10px', mdLg: '12px', lg: '14px', xl: '20px' },
  Opacity: { subtle: .04, faint: .08, muted: .15, medium: .35, strong: .55, prominent: .8 },
  IconSize: { xs: '14px', sm: '18px', md: '22px', lg: '26px', xl: '30px' },
  Shadow: { sm: '0 .5px 1px rgba(0,0,0,.3)', md: '0 2px 4px rgba(0,0,0,.3)', lg: '0 8px 24px rgba(0,0,0,.25)' },
  Anim: { hover: '.15s', transition: '.2s' },
  Window: { homeDefault: { width: 1200, height: 880 }, projectMin: { width: 960, height: 600 } },
  Font: { interface: 'Inter, "Segoe UI", system-ui, sans-serif', mono: '"Cascadia Code", Consolas, monospace' },
  Tracking: { tight: '-.5px', normal: '0', wide: '1.5px' },
  Layout: {
    minWidth: '960px', minHeight: '600px', titleHeight: '62px', panelHeader: '46px', statusHeight: '32px',
    mediaWidth: '258px', inspectorWidth: '250px', timelineHeight: '274px', timelineMin: '190px',
    viewerMin: '170px', controlHeight: '32px', fieldHeight: '30px', sourceCardHeight: '72px', thumbWidth: '84px',
    thumbHeight: '52px', trackLabelWidth: '108px', trackHeight: '66px', rulerHeight: '30px', timelineBaseWidth: '760px',
    clipTop: '8px', clipHeight: '50px', playheadWidth: '2px', emptyIcon: '40px', badgeDot: '5px',
    messageMaxWidth: '620px', modalWidth: '440px', modalInset: '24px', focusOffset: '2px', buttonMax: '190px',
    lineHeight: 1.5, headingLineHeight: 1.2, selectedClipWidth: '2px', scrollWidth: '8px',
    inspectorFieldWidth: '84px', progressWidth: '160px', noticeWidth: '320px', sourceAspect: '16 / 9',
    viewportShort: '740px', viewportNarrow: '1100px', shortTimelineHeight: '220px', smallInspector: '220px', smallMedia: '226px',
    trackTint: '25%', trackHoverTint: '35%',
  },
};

export function themeVariables() {
  return Object.fromEntries(Object.entries(AppTheme).flatMap(([group, values]) =>
    Object.entries(values).filter(([, value]) => typeof value !== 'object').map(([name, value]) => [`--${group.toLowerCase()}-${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`, String(value)])));
}
