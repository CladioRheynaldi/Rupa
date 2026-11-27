class PreviewFailure(ValueError):
    def __init__(self, code, detail_number=None):
        self.code = code
        self.detail_number = detail_number
        super().__init__(code)
