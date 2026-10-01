// Imports the standard packages students commonly use so their compiled form is in the
// image's read-only build cache (a cold Go build cache costs several seconds per compile).
package main

import (
	"bufio"
	"bytes"
	"container/heap"
	"container/list"
	"container/ring"
	"errors"
	"fmt"
	"io"
	"maps"
	"math"
	"math/big"
	"math/bits"
	"math/rand"
	"os"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

var _ = []any{bufio.NewReader, bytes.NewBuffer, heap.Init, list.New, ring.New, errors.New, fmt.Println, io.EOF,
	maps.Keys[map[int]int], math.Abs, big.NewInt, bits.OnesCount, rand.Intn, os.Exit, regexp.MustCompile,
	slices.Sort[[]int], sort.Ints, strconv.Itoa, strings.Fields, time.Now, unicode.IsDigit, utf8.RuneLen}

func main() {}
