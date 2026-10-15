#include <libdragon.h>

#define AUDIO_HZ 32000.0f
#define AUDIO_MIXER_CHANNEL 0
#define PAUSE_BAR_W 5
#define PAUSE_BAR_H 20
#define PAUSE_BAR_GAP 5
#define PAUSE_BOTTOM_MARGIN 20
#define PLAY_ICON_H PAUSE_BAR_H
#define PLAY_ICON_W 18

/**
 * Find decoded video, the file is available 
 * in the file container inside the z64. 
 */
static const char *find_video_filename(void){
    static const char *candidates[] = {
        "rom:/video.m1v",
        "rom:/video.h264",
    };
    for (int i = 0; i < 2; i++) {
        const char *dfs_path = candidates[i] + 5;
        if (dfs_rom_size(dfs_path) != DFS_ENOFILE)
            return candidates[i];
    }
    return candidates[0];
}

/** Runtime settings the app writes into "rom:/player.cfg". */
typedef struct {
    bool frame_skipping;    ///< fmv frame skipping (default: enabled, fmv's own default)
    int audio_latency_ms;   ///< audio headroom for audio_init (default: libdragon's 160 ms)
    int audio_buffer_samples; ///< AI buffer size in samples (default: 1024, see main())
} player_cfg_t;

/**
 * Read the optional "rom:/player.cfg" ("key=value" lines). Missing file or
 * keys keep the defaults.
 */
static player_cfg_t read_player_cfg(void){
    player_cfg_t cfg = { .frame_skipping = true, .audio_latency_ms = 160, .audio_buffer_samples = 1024 };
    FILE *f = fopen("rom:/player.cfg", "r");
    if (!f)
        return cfg;
    char line[64];
    int value;
    while (fgets(line, sizeof(line), f)) {
        if (sscanf(line, "frame_skipping=%d", &value) == 1)
            cfg.frame_skipping = value != 0;
        else if (sscanf(line, "audio_latency_ms=%d", &value) == 1 && value >= 40 && value <= 2000)
            cfg.audio_latency_ms = value;
        else if (sscanf(line, "audio_buffer_samples=%d", &value) == 1 && value >= 512 && value <= 4096 && value % 512 == 0)
            cfg.audio_buffer_samples = value;
    }
    fclose(f);
    return cfg;
}

/**
 * Draw pause icon
 * 
 */
static void draw_pause_icon(void){
    int w = display_get_width();
    int h = display_get_height();
    int total_w = PAUSE_BAR_W * 2 + PAUSE_BAR_GAP;
    int x0 = (w - total_w) / 2;
    int y1 = h - PAUSE_BOTTOM_MARGIN;
    int y0 = y1 - PAUSE_BAR_H;

    rdpq_set_mode_fill(RGBA32(255, 255, 255, 255));
    rdpq_fill_rectangle(x0, y0, x0 + PAUSE_BAR_W, y1);
    rdpq_fill_rectangle(x0 + PAUSE_BAR_W + PAUSE_BAR_GAP, y0, x0 + PAUSE_BAR_W * 2 + PAUSE_BAR_GAP, y1);
}

/**
 * Draw play icon at the end of the video
 * 
 */
static void draw_play_icon(surface_t *disp, uint32_t color){
    int w = display_get_width();
    int h = display_get_height();
    int y1 = h - PAUSE_BOTTOM_MARGIN;
    int y0 = y1 - PLAY_ICON_H;
    int x0 = (w - PLAY_ICON_W) / 2;

    for (int y = y0; y <= y1; y++) {
        int dy = abs(2 * (y - y0) - PLAY_ICON_H);         
        int row_w = PLAY_ICON_W - (PLAY_ICON_W * dy) / PLAY_ICON_H;
        graphics_draw_line(disp, x0, y, x0 + row_w, y, color);
    }
}

/**
 * Pause action pressing A
 * 
 */
static void video_osd_callback(void *ctx, int frame_idx, float time_sec, fmv_control_t *ctrl) {
    static bool paused = false;

    joypad_poll();
    if (joypad_get_buttons_pressed(JOYPAD_PORT_1).a) {
        paused = !paused;
        ctrl->pause(ctrl, paused);
        // Freeze the audio channel (frequency 0) instead of stopping it: its
        // position never moves, so resume is exact with every codec and the
        // master clock fmv's frame skipping syncs against never goes backwards.
        if (ctrl->audio) {
            if (paused) {
                mixer_ch_set_vol(AUDIO_MIXER_CHANNEL, 0.0f, 0.0f);
                mixer_ch_set_freq(AUDIO_MIXER_CHANNEL, 0.0f);
            } else {
                mixer_ch_set_freq(AUDIO_MIXER_CHANNEL, ctrl->audio->wave.frequency);
                mixer_ch_set_vol(AUDIO_MIXER_CHANNEL, 1.0f, 1.0f);
            }
        }
    }

    if (paused){
        draw_pause_icon();
    }
}

/**
 * Replay Action at the end of the video
 * 
 */
static void wait_for_replay(resolution_t video_res) {
    display_init(video_res, DEPTH_32_BPP, 2, GAMMA_NONE, FILTERS_RESAMPLE);

    const uint32_t white = graphics_make_color(255, 255, 255, 255);
    const uint32_t black = graphics_make_color(0, 0, 0, 255);

    for (;;) {
        joypad_poll();
        if (joypad_get_buttons_pressed(JOYPAD_PORT_1).a)
            break;

        surface_t *disp = display_get();
        graphics_fill_screen(disp, black);
        draw_play_icon(disp, white);
        display_show(disp);
    }

    display_close();
}

/**
 * Main 
 * 
 */
int main(void) {
    dfs_init(DFS_DEFAULT_LOCATION);
    rdpq_init();
    yuv_init();
    player_cfg_t cfg = read_player_cfg();
    audio_init(AUDIO_HZ, AUDIO_INIT_LATENCY_MS(cfg.audio_latency_ms));
    mixer_init(8);
    // fmv_play only feeds the mixer twice per video frame, and while the RSP
    // is busy decoding video each call fills a single AI buffer. With
    // mixer_init's 512-sample buffers that is ~0.77 s of audio per second at
    // 24 fps (stereo VADPCM played slow and choppy); 1024 doubles it.
    // Multiples of 512 keep mixer_init's own round alignment.
    audio_set_buffer_granularity(cfg.audio_buffer_samples);
    joypad_init();

    wav64_init_compression(2);
    wav64_init_compression(3);

    mixer_ch_set_limits(AUDIO_MIXER_CHANNEL, 16, 48000, 0);
    video_register_codec(&mpeg1_codec);
    video_register_codec(&h264_codec);

    const char *video_fn = find_video_filename();

    video_t *probe = video_open(video_fn, &(video_parms_t){ .buffered_pics = 1 });
    video_info_t vinfo = video_get_info(probe);
    video_close(probe);
    resolution_t video_res = {
        .width = vinfo.width,
        .height = vinfo.height,
        .aspect_ratio = vinfo.aspect_ratio,
        .overscan_margin = 0,
    };

    for (;;) {
        fmv_play(video_fn, &(fmv_parms_t){
            .audio_mixer_channel = AUDIO_MIXER_CHANNEL,
            .osd_callback = video_osd_callback,
            .disable_frame_skipping = !cfg.frame_skipping,
        });
        wait_for_replay(video_res);
    }
}
