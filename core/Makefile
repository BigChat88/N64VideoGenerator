V=1
SOURCE_DIR=src
BUILD_DIR=build
LIBDRAGON_PREVIEW = 2

include $(N64_INST)/include/n64.mk

all: video.z64
.PHONY: all

OBJS = $(BUILD_DIR)/main.o

video.z64: N64_ROM_TITLE="Video Player"
video.z64: $(BUILD_DIR)/video.dfs

$(BUILD_DIR)/video.elf: $(OBJS)

$(BUILD_DIR)/video.dfs: filesystem/video.m1v
	@echo "    [DFS] $@"
	$(N64_MKDFS) "$@" filesystem >/dev/null

filesystem/video.m1v: video.mp4
	@mkdir -p filesystem
	@echo "    [VIDEO] $@"
	$(N64_VIDEOCONV) -o filesystem --codec mpeg1 --quality 70 --seek 5 "$<"

clean:
	rm -rf $(BUILD_DIR) filesystem video.z64
.PHONY: clean

-include $(wildcard $(BUILD_DIR)/*.d)
