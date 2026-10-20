# Parent-relative god-file findings — 2026-09-30

VERIFIED static counts at the inventoried heads, using the canonical file list
and line-count definition from scripts/check_god_files.mjs. All 279 open PRs
were counted; 49 of the 237 product-stack PRs grow at least one tracked file
against the actual current parent. The canonical gate was independently run at
#643 and reproduced the first failure. These counts do not prove runtime behavior.

Preserve each existing fix and repair growth before its merge. Do not waive the
gate, remove a product feature, or assume passing against today's main means a
parent-relative pass after earlier shrinkage lands. Recalculate after head or
base changes. Index.js reaches 33,603 at #722 and stays exact thereafter.

| PR | File | Parent lines | Head lines | Growth |
| --- | --- | ---: | ---: | ---: |
| [#643](https://github.com/FramehouseStudios/them/pull/643) | them/RootExperienceView.swift | 15031 | 15033 | +2 |
| [#644](https://github.com/FramehouseStudios/them/pull/644) | them/ScreenplayStudioScreen.swift | 17411 | 17415 | +4 |
| [#644](https://github.com/FramehouseStudios/them/pull/644) | them/RootExperienceView.swift | 15033 | 15038 | +5 |
| [#669](https://github.com/FramehouseStudios/them/pull/669) | them/RootExperienceView.swift | 14783 | 14784 | +1 |
| [#669](https://github.com/FramehouseStudios/them/pull/669) | them/BackendMemoryAPI.swift | 10845 | 10850 | +5 |
| [#670](https://github.com/FramehouseStudios/them/pull/670) | them/BackendMemoryAPI.swift | 10850 | 10863 | +13 |
| [#671](https://github.com/FramehouseStudios/them/pull/671) | them/RootExperienceView.swift | 14784 | 14788 | +4 |
| [#672](https://github.com/FramehouseStudios/them/pull/672) | them/RootExperienceView.swift | 14788 | 14865 | +77 |
| [#674](https://github.com/FramehouseStudios/them/pull/674) | them/RootExperienceView.swift | 14865 | 14870 | +5 |
| [#675](https://github.com/FramehouseStudios/them/pull/675) | them/RootExperienceView.swift | 14870 | 14893 | +23 |
| [#679](https://github.com/FramehouseStudios/them/pull/679) | them/RootExperienceView.swift | 14893 | 14895 | +2 |
| [#681](https://github.com/FramehouseStudios/them/pull/681) | them/RootExperienceView.swift | 14895 | 14899 | +4 |
| [#683](https://github.com/FramehouseStudios/them/pull/683) | them/RootExperienceView.swift | 14896 | 14898 | +2 |
| [#685](https://github.com/FramehouseStudios/them/pull/685) | them/RootExperienceView.swift | 14890 | 14903 | +13 |
| [#686](https://github.com/FramehouseStudios/them/pull/686) | them/RootExperienceView.swift | 14903 | 14927 | +24 |
| [#689](https://github.com/FramehouseStudios/them/pull/689) | them/RootExperienceView.swift | 14927 | 14929 | +2 |
| [#692](https://github.com/FramehouseStudios/them/pull/692) | them/ScreenplayStudioScreen.swift | 17415 | 17426 | +11 |
| [#693](https://github.com/FramehouseStudios/them/pull/693) | them/ScreenplayStudioScreen.swift | 17426 | 17429 | +3 |
| [#694](https://github.com/FramehouseStudios/them/pull/694) | them/ScreenplayStudioScreen.swift | 17429 | 17432 | +3 |
| [#697](https://github.com/FramehouseStudios/them/pull/697) | them/BackendMemoryAPI.swift | 10863 | 10864 | +1 |
| [#704](https://github.com/FramehouseStudios/them/pull/704) | them/ScreenplayStudioScreen.swift | 17432 | 17433 | +1 |
| [#716](https://github.com/FramehouseStudios/them/pull/716) | them/ScreenplayStudioScreen.swift | 17422 | 17423 | +1 |
| [#717](https://github.com/FramehouseStudios/them/pull/717) | them/RootExperienceView.swift | 14927 | 14928 | +1 |
| [#719](https://github.com/FramehouseStudios/them/pull/719) | them/BackendMemoryAPI.swift | 10864 | 10865 | +1 |
| [#729](https://github.com/FramehouseStudios/them/pull/729) | them/ScreenplayStudioScreen.swift | 17420 | 17422 | +2 |
| [#735](https://github.com/FramehouseStudios/them/pull/735) | them/ScreenplayStudioScreen.swift | 17421 | 17422 | +1 |
| [#740](https://github.com/FramehouseStudios/them/pull/740) | them/ScreenplayStudioScreen.swift | 17414 | 17419 | +5 |
| [#742](https://github.com/FramehouseStudios/them/pull/742) | them/ScreenplayStudioScreen.swift | 17419 | 17421 | +2 |
| [#743](https://github.com/FramehouseStudios/them/pull/743) | them/ScreenplayStudioScreen.swift | 17421 | 17427 | +6 |
| [#744](https://github.com/FramehouseStudios/them/pull/744) | them/ScreenplayStudioScreen.swift | 17427 | 17431 | +4 |
| [#748](https://github.com/FramehouseStudios/them/pull/748) | them/RootExperienceView.swift | 14928 | 14931 | +3 |
| [#753](https://github.com/FramehouseStudios/them/pull/753) | them/RootExperienceView.swift | 14931 | 14939 | +8 |
| [#755](https://github.com/FramehouseStudios/them/pull/755) | them/RootExperienceView.swift | 14939 | 14945 | +6 |
| [#758](https://github.com/FramehouseStudios/them/pull/758) | them/BackendMemoryAPI.swift | 10837 | 10847 | +10 |
| [#759](https://github.com/FramehouseStudios/them/pull/759) | them/RootExperienceView.swift | 14945 | 14948 | +3 |
| [#763](https://github.com/FramehouseStudios/them/pull/763) | them/RootExperienceView.swift | 14948 | 14967 | +19 |
| [#764](https://github.com/FramehouseStudios/them/pull/764) | them/RootExperienceView.swift | 14967 | 14993 | +26 |
| [#767](https://github.com/FramehouseStudios/them/pull/767) | them/ScreenplayLiveDraftBridge.swift | 12696 | 12702 | +6 |
| [#768](https://github.com/FramehouseStudios/them/pull/768) | them/ScreenplayStudioScreen.swift | 17428 | 17429 | +1 |
| [#769](https://github.com/FramehouseStudios/them/pull/769) | them/ScreenplayStudioScreen.swift | 17429 | 17434 | +5 |
| [#772](https://github.com/FramehouseStudios/them/pull/772) | them/RootExperienceView.swift | 14993 | 14999 | +6 |
| [#775](https://github.com/FramehouseStudios/them/pull/775) | them/RootExperienceView.swift | 14999 | 15020 | +21 |
| [#776](https://github.com/FramehouseStudios/them/pull/776) | them/RootExperienceView.swift | 15020 | 15022 | +2 |
| [#786](https://github.com/FramehouseStudios/them/pull/786) | them/RootExperienceView.swift | 15017 | 15022 | +5 |
| [#786](https://github.com/FramehouseStudios/them/pull/786) | them/BackendMemoryAPI.swift | 10843 | 10847 | +4 |
| [#789](https://github.com/FramehouseStudios/them/pull/789) | them/BackendMemoryAPI.swift | 10847 | 10848 | +1 |
| [#791](https://github.com/FramehouseStudios/them/pull/791) | them/ScreenplayLiveDraftBridge.swift | 12702 | 12713 | +11 |
| [#793](https://github.com/FramehouseStudios/them/pull/793) | them/ScreenplayStudioScreen.swift | 17422 | 17427 | +5 |
| [#794](https://github.com/FramehouseStudios/them/pull/794) | them/ScreenplayStudioScreen.swift | 17427 | 17428 | +1 |
| [#794](https://github.com/FramehouseStudios/them/pull/794) | them/RootExperienceView.swift | 14959 | 14986 | +27 |
| [#800](https://github.com/FramehouseStudios/them/pull/800) | them/RootExperienceView.swift | 14986 | 15007 | +21 |
| [#800](https://github.com/FramehouseStudios/them/pull/800) | them/ScreenplayLiveDraftBridge.swift | 12713 | 12714 | +1 |
| [#807](https://github.com/FramehouseStudios/them/pull/807) | them/RootExperienceView.swift | 14941 | 14950 | +9 |
| [#870](https://github.com/FramehouseStudios/them/pull/870) | them/ScreenplayLiveDraftBridge.swift | 12588 | 12595 | +7 |
