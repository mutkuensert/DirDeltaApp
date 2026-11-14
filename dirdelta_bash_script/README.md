# DirDelta

`dirdelta` is a small Bash utility that compares two directory trees and reports
regular files that are present in one tree but missing at the same relative path
in the other. It does not copy, modify, or delete any files.

## Usage

```bash
./dirdelta parentDir1 parentDir2
```

The script requires exactly two arguments.

Each section shows its source and target once, followed by paths relative to the
source. `[FILE]` marks individual files and `[DIR ]` marks collapsed directories.
The summary counts displayed entries; files inside collapsed directories are not
counted separately. Colors are enabled only for supported terminals; set
`NO_COLOR=1` to disable them. Redirected output contains no color codes.

## What It Does

Given two parent directories, the script:

1. Lists files in `parentDir1` that are missing from `parentDir2`.
2. Lists files in `parentDir2` that are missing from `parentDir1`.
3. Reports when one directory contains every file found in the other.

If a directory is absent from the other tree, only its directory path (with a
trailing `/`) is listed, including for empty directories. An existing directory
is also listed as a single path when none of its regular files, including files
in subdirectories, exist at the corresponding paths in the other tree. If some
files are present, only the missing files or collapsed subdirectories are listed.
The two parent directories themselves are never collapsed.

Files are compared by relative path, not by content. A file present at the same
relative path in both directories is treated as present even when its contents
differ. Hidden files are included in the comparison.

## Example

Before running the script:

```text
dir_1/
├── file_1.txt
├── file_2.txt
└── notes/today.txt

dir_2/
├── file_2.txt
├── file_3.txt
└── drafts/idea.txt
```

Run:

```bash
./dirdelta dir_1 dir_2
```

Output:

```text
Missing from target
  Source: dir_1
  Target: dir_2

  [FILE]  file_1.txt
  [DIR ]  notes/

  Listed: 1 file(s), 1 directory group(s)

------------------------------------------------------------

Missing from target
  Source: dir_2
  Target: dir_1

  [FILE]  file_3.txt
  [DIR ]  drafts/

  Listed: 1 file(s), 1 directory group(s)
```

## Notes

- The script does not compare file contents.
