#!/usr/bin/env sh
# Materialise snapshot node_modules from the worktree's installed dependencies.
#
# Usage: snapshot-node-modules.sh <repo> <snapshot>
#
# Real entries link by absolute path (read-only reuse). Symlink entries are
# recreated from readlink() targets so relative workspace links rebind to the
# snapshot's staged packages. Scope containers (@…) are real directories that
# hold such links. .cache/.vite/.vitest stay snapshot-local so runners do not
# write through into the worktree.

set -e

repo=$1
snapshot=$2
if [ -z "$repo" ] || [ -z "$snapshot" ]; then
	echo "snapshot-node-modules: usage: $0 <repo> <snapshot>" >&2
	exit 1
fi

link_dir() (
	src=$1
	dst=$2
	mkdir -p "$dst"
	for entry in "$src"/* "$src"/.[!.]* "$src"/..?*; do
		[ -e "$entry" ] || continue
		name=${entry##*/}
		case $name in
		.cache | .vite | .vitest) continue ;;
		esac
		if [ -L "$entry" ]; then
			ln -s "$(readlink "$entry")" "$dst/$name"
		elif [ -d "$entry" ] && [ "${name#@}" != "$name" ]; then
			link_dir "$entry" "$dst/$name"
		else
			ln -s "$entry" "$dst/$name"
		fi
	done
)

link_dir "$repo/node_modules" "$snapshot/node_modules"
for pkgdir in "$repo"/packages/*; do
	[ -d "$pkgdir/node_modules" ] || continue
	mkdir -p "$snapshot/packages/${pkgdir##*/}"
	link_dir "$pkgdir/node_modules" "$snapshot/packages/${pkgdir##*/}/node_modules"
done
